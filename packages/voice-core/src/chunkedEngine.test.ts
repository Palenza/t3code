import { describe, expect, it } from "vite-plus/test";

import { ChunkedTranscriptionEngine } from "./chunkedEngine.ts";
import type { Recognizer, TranscriptionUpdate } from "./protocol.ts";

describe("chunked transcription engine", () => {
  it("emits ready, partial replacement, final, and ended with monotonic segments", async () => {
    let now = 0;
    const updates: Array<TranscriptionUpdate> = [];
    const recognizer: Recognizer = {
      capabilities: {},
      transcribe: async (pcm) => ({ text: `samples:${pcm.length}` }),
    };
    const engine = new ChunkedTranscriptionEngine({
      recognizer,
      onUpdate: (update) => updates.push(update),
      now: () => now,
      minimumSegmentSeconds: 0,
    });
    await engine.start({ sessionId: "voice-1", sampleRate: 8_000 });
    engine.pushAudio(new Float32Array([0.1, 0.1, 0.1]));
    await Promise.resolve();
    now = 1_300;
    await engine.tick();
    await engine.stopAndCommit();
    expect(updates.map((update) => update.kind)).toEqual(["ready", "partial", "final", "ended"]);
    expect(updates.find((update) => update.kind === "final")).toMatchObject({
      segmentId: 0,
    });
  });

  it("backs off cadence when inference is slower than realtime", async () => {
    let now = 0;
    const recognizer: Recognizer = {
      capabilities: {},
      transcribe: async () => {
        now += 2_000;
        return { text: "slow" };
      },
    };
    const engine = new ChunkedTranscriptionEngine({
      recognizer,
      onUpdate: () => undefined,
      now: () => now,
      partialIntervalSeconds: 1,
      minimumRealtimeFactor: 5,
    });
    await engine.start({ sessionId: "voice-2", sampleRate: 8_000 });
    engine.pushAudio(new Float32Array(8_000));
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.cadence.partialIntervalSeconds).toBeGreaterThan(1);
    expect(engine.cadence.maxSegmentSeconds).toBeLessThan(60);
  });

  it("coalesces ticks while a recognizer run is in flight", async () => {
    let resolve: ((value: { text: string }) => void) | undefined;
    let calls = 0;
    const recognizer: Recognizer = {
      capabilities: {},
      transcribe: async () => {
        calls += 1;
        return new Promise<{ text: string }>((done) => {
          resolve = done;
        });
      },
    };
    const engine = new ChunkedTranscriptionEngine({
      recognizer,
      onUpdate: () => undefined,
      now: () => 9_999,
      minimumSegmentSeconds: 0,
    });
    await engine.start({ sessionId: "voice-3" });
    engine.pushAudio(new Float32Array([0.1]));
    engine.pushAudio(new Float32Array([0.1]));
    await engine.tick();
    expect(calls).toBe(1);
    resolve?.({ text: "done" });
    await Promise.resolve();
  });

  it("retains audio arriving while the previous segment finalizes", async () => {
    let releaseFirstFinal: (() => void) | undefined;
    let markFirstFinalStarted: (() => void) | undefined;
    const firstFinalStarted = new Promise<void>((resolve) => {
      markFirstFinalStarted = resolve;
    });
    let calls = 0;
    const finalLengths: Array<number> = [];
    const recognizer: Recognizer = {
      capabilities: {},
      transcribe: async (pcm, options) => {
        calls += 1;
        if (calls === 1) {
          markFirstFinalStarted?.();
          await new Promise<void>((resolve, reject) => {
            releaseFirstFinal = resolve;
            options.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          });
        }
        finalLengths.push(pcm.length);
        return { text: `samples:${pcm.length}` };
      },
    };
    const updates: Array<TranscriptionUpdate> = [];
    const engine = new ChunkedTranscriptionEngine({
      recognizer,
      onUpdate: (update) => updates.push(update),
      partialIntervalSeconds: 99,
      silenceToFinalizeSeconds: 0,
      minimumSegmentSeconds: 0,
    });
    await engine.start({ sessionId: "voice-4", sampleRate: 8_000 });
    engine.pushAudio(new Float32Array([0.1]));
    await firstFinalStarted;
    engine.pushAudio(new Float32Array([0.2, 0.2]));
    releaseFirstFinal?.();
    await engine.stopAndCommit();

    expect(finalLengths).toEqual([1, 2]);
    expect(
      updates.filter((update) => update.kind === "final").map((update) => update.segmentId),
    ).toEqual([0, 1]);
  });

  it("does not let a cancelled stop completion end a replacement session with the same id", async () => {
    let release: (() => void) | undefined;
    const recognizer: Recognizer = {
      capabilities: {},
      transcribe: (_pcm, options) =>
        new Promise((resolve, reject) => {
          release = () => resolve({ text: "stale" });
          options.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    };
    const updates: TranscriptionUpdate[] = [];
    const engine = new ChunkedTranscriptionEngine({
      recognizer,
      onUpdate: (update) => updates.push(update),
      partialIntervalSeconds: 99,
      minimumSegmentSeconds: 0,
    });
    await engine.start({ sessionId: "reused" });
    engine.pushAudio(new Float32Array([0.1]));
    const stopping = engine.stopAndCommit();
    await Promise.resolve();
    engine.cancel();
    await engine.start({ sessionId: "reused" });
    release?.();
    await stopping;

    expect(updates.map((update) => update.kind)).toEqual(["ready", "ended", "ready"]);
  });

  // FIGE UN COMPORTEMENT EXISTANT, ne corrige rien — et le dire importe.
  //
  // Le silence coûterait l'ENREGISTREMENT, pas seulement un bouton qui tourne :
  // `useVoiceDictationSession` arme un délai dès la demande d'arrêt et ne le
  // désarme que sur `ended` (un `final` range le texte, il ne conclut rien).
  // Au bout du délai, l'UI JETTE le transcript dicté.
  //
  // J'ai cru le 01/08 que le moteur sortait sans `ended` quand la
  // reconnaissance échouait, et j'ai écrit un correctif. Ce test, passé sur le
  // code d'ORIGINE, l'a démenti : `#finalizationTail` est `.catch`-gardé, donc
  // il ne rejette jamais et l'échec voyage dans `#backgroundError`. Correctif
  // annulé. Le test reste parce qu'il verrouille ce qui protège vraiment :
  // si quelqu'un retire ce `.catch`, l'échec deviendrait un rejet, `ended` ne
  // serait plus émis, et la dictée se perdrait en silence.
  it("annonce `ended` même quand la reconnaissance échoue, et propage l'erreur", async () => {
    const recognizer: Recognizer = {
      capabilities: {},
      transcribe: () => Promise.reject(new Error("moteur indisponible")),
    };
    const updates: TranscriptionUpdate[] = [];
    const engine = new ChunkedTranscriptionEngine({
      recognizer,
      onUpdate: (update) => updates.push(update),
      partialIntervalSeconds: 99,
      minimumSegmentSeconds: 0,
    });
    await engine.start({ sessionId: "qui-rejette" });
    engine.pushAudio(new Float32Array([0.1]));

    await expect(engine.stopAndCommit()).rejects.toThrow("moteur indisponible");
    // L'erreur remonte ET l'UI est débloquée : les deux, pas l'un ou l'autre.
    expect(updates.map((update) => update.kind)).toContain("ended");
  });

  it("matches the sidecar by skipping inference at or below 0.3 seconds", async () => {
    const lengths: number[] = [];
    const recognizer: Recognizer = {
      capabilities: {},
      transcribe: async (pcm) => {
        lengths.push(pcm.length);
        return { text: "speech" };
      },
    };
    const updates: TranscriptionUpdate[] = [];
    const engine = new ChunkedTranscriptionEngine({
      recognizer,
      onUpdate: (update) => updates.push(update),
      partialIntervalSeconds: 0,
    });
    await engine.start({ sessionId: "minimum-segment", sampleRate: 8_000 });
    engine.pushAudio(new Float32Array(2_400));
    await engine.tick();
    await engine.stopAndCommit();

    expect(lengths).toEqual([]);
    expect(updates.map((update) => update.kind)).toEqual(["ready", "ended"]);
  });
});
