import { ClaudeSettings } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as ProcessRunner from "../../processRunner.ts";

import {
  buildClaudeCapabilitiesProbeQueryOptions,
  CLAUDE_CAPABILITIES_PROBE_SETTING_SOURCES,
  probeClaudeCapabilities,
} from "./ClaudeProvider.ts";

const decodeClaudeSettings = Schema.decodeSync(ClaudeSettings);

it("isolates Claude capability probes without dropping workspace setting sources", () => {
  const abortController = new AbortController();
  const options = buildClaudeCapabilitiesProbeQueryOptions({
    executablePath: "/usr/bin/claude",
    abortController,
    environment: {
      HOME: "/home/user",
      ENABLE_CLAUDEAI_MCP_SERVERS: "true",
    },
    cwd: "/workspace/project",
  });

  assert.deepEqual(options.mcpServers, {});
  assert.equal(options.strictMcpConfig, true);
  assert.equal(options.cwd, "/workspace/project");
  assert.deepEqual(options.settingSources, [...CLAUDE_CAPABILITIES_PROBE_SETTING_SOURCES]);
  assert.deepEqual(options.allowedTools, []);
  assert.equal(options.persistSession, false);
  assert.equal(options.pathToClaudeCodeExecutable, "/usr/bin/claude");
  assert.equal(options.abortController, abortController);
  assert.equal(options.env?.HOME, "/home/user");
  assert.equal(options.env?.ENABLE_CLAUDEAI_MCP_SERVERS, "false");
});

/**
 * La fausse binaire `claude`, partagée par les deux tests.
 *
 * Elle est ici — et non recopiée — parce que le second test vérifie une
 * propriété DE CE SCRIPT : qu'il meurt quand on lui ferme stdin. Deux copies
 * divergeraient, et c'est la copie non testée qui fuirait.
 */
const SCRIPT_FAUSSE_BINAIRE = [
  "#!/usr/bin/env node",
  'import { existsSync, readFileSync, writeFileSync } from "node:fs";',
  'import { createInterface } from "node:readline";',
  "const args = process.argv.slice(2);",
  'const mcpConfigIndex = args.indexOf("--mcp-config");',
  "const rawMcpConfig = mcpConfigIndex >= 0 ? args[mcpConfigIndex + 1] : undefined;",
  "let mcpConfig;",
  "if (rawMcpConfig) {",
  '  const contents = existsSync(rawMcpConfig) ? readFileSync(rawMcpConfig, "utf8") : rawMcpConfig;',
  "  try { mcpConfig = JSON.parse(contents); } catch { mcpConfig = contents; }",
  "}",
  "writeFileSync(process.env.T3_PROBE_INVOCATION_PATH, JSON.stringify({",
  "  args,",
  // Le test s'en sert pour PROUVER que ce processus meurt. Sans ça,
  // rien ne remarquerait qu'on a cessé de le tuer.
  "  pid: process.pid,",
  "  cwd: process.cwd(),",
  "  connectorEnv: process.env.ENABLE_CLAUDEAI_MCP_SERVERS,",
  "  mcpConfig,",
  "}));",
  "const lines = createInterface({ input: process.stdin });",
  'lines.on("line", (line) => {',
  "  const message = JSON.parse(line);",
  '  if (message.type !== "control_request" || message.request?.subtype !== "initialize") return;',
  "  process.stdout.write(JSON.stringify({",
  '    type: "control_response",',
  "    response: {",
  '      subtype: "success",',
  "      request_id: message.request_id,",
  "      response: {",
  '        commands: [{ name: "review", description: "Review changes", argumentHint: "[path]" }],',
  "        agents: [],",
  '        output_style: "default",',
  '        available_output_styles: ["default"],',
  "        models: [],",
  '        account: { email: "dev@example.com", subscriptionType: "pro", tokenSource: "oauth" },',
  "      },",
  "    },",
  '  }) + "\\n");',
  "});",
  // PAS de `setInterval` pour rester en vie. `readline` sur stdin
  // suffit tant que le parent tient le tube ouvert, et surtout : il
  // LÂCHE quand le parent ferme. Un timer, lui, ne lâche jamais — le
  // faux binaire survivait à l'abandon de la sonde, était réattaché à
  // launchd, et vivait jusqu'au redémarrage de la machine. Mesuré :
  // 63 processus orphelins, le plus vieux depuis 1 j 15 h.
  "",
].join("\n");

it.layer(ProcessRunner.layer.pipe(Layer.provideMerge(NodeServices.layer)))(
  "Claude capability probe SDK boundary",
  (it) => {
    it.effect("serializes strict no-MCP options and still resolves account capabilities", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-claude-probe-sdk-" });
        const executablePath = path.join(tempDir, "fake-claude.mjs");
        const invocationPath = path.join(tempDir, "invocation.json");
        const workspaceCwd = path.join(tempDir, "workspace");
        yield* fs.makeDirectory(workspaceCwd, { recursive: true });

        yield* fs.writeFileString(executablePath, SCRIPT_FAUSSE_BINAIRE);
        yield* fs.chmod(executablePath, 0o755);

        const capabilities = yield* probeClaudeCapabilities(
          decodeClaudeSettings({ binaryPath: executablePath }),
          {
            ...process.env,
            T3_PROBE_INVOCATION_PATH: invocationPath,
            ENABLE_CLAUDEAI_MCP_SERVERS: "true",
          },
          workspaceCwd,
        );

        assert.deepEqual(capabilities, {
          email: "dev@example.com",
          subscriptionType: "pro",
          tokenSource: "oauth",
          apiProvider: undefined,
          slashCommands: [
            {
              name: "review",
              description: "Review changes",
              input: { hint: "[path]" },
            },
          ],
        });

        // @effect-diagnostics-next-line preferSchemaOverJson:off
        const invocation = JSON.parse(yield* fs.readFileString(invocationPath)) as {
          readonly args: ReadonlyArray<string>;
          readonly pid: number;
          readonly cwd: string;
          readonly connectorEnv: string;
          readonly mcpConfig: unknown;
        };

        assert.equal(invocation.cwd, yield* fs.realPath(workspaceCwd));
        assert.equal(invocation.connectorEnv, "false");
        assert.equal(invocation.args.includes("--strict-mcp-config"), true);
        assert.equal(invocation.args.includes("--mcp-config"), false);
        assert.equal(invocation.mcpConfig, undefined);

        assert.equal(invocation.args.includes("--setting-sources=user,project,local"), true);
      }).pipe(Effect.scoped),
    );

    it.effect("la fausse binaire meurt quand son parent lâche stdin", () =>
      Effect.gen(function* () {
        // L'invariant que personne ne gardait, et qui a coûté 63 processus
        // orphelins — le plus vieux vivant depuis 1 j 15 h, réattaché à launchd,
        // increvable jusqu'au redémarrage de la machine.
        //
        // Le chemin NORMAL n'a jamais fui : la sonde abandonne, le SDK tue son
        // enfant, tout va bien — c'est pour ça qu'aucun test ne voyait rien. La
        // fuite était sur le chemin ANORMAL : une exécution de tests interrompue,
        // un parent tué net. Là, plus personne n'envoie de signal ; il ne reste
        // que la fermeture du tube. Un script qui se maintient en vie par un
        // timer y survit, un script qui n'écoute que stdin non.
        //
        // On ne peut pas tuer vitest depuis un test, mais on peut reproduire
        // exactement ce que l'orphelin reçoit : stdin fermé, et rien d'autre.
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const runner = yield* ProcessRunner.ProcessRunner;
        const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-claude-probe-orphelin-" });
        const executablePath = path.join(tempDir, "fake-claude.mjs");
        yield* fs.writeFileString(executablePath, SCRIPT_FAUSSE_BINAIRE);

        // La limite se compte sur l'horloge du SYSTÈME, pas sur celle d'Effect :
        // `it.effect` fournit une TestClock, sous laquelle ni `Effect.sleep` ni
        // le délai interne de `ProcessRunner` n'arrivent jamais tout seuls. Sans
        // ça le test échouerait quand même — mais au bout des 120 s de vitest et
        // sur « Test timed out », pas sur la phrase qui dit quoi faire. Un garde
        // qui rend une fenêtre blanche ne répare rien (A7).
        const verdict = yield* Effect.raceFirst(
          runner
            .run({
              command: process.execPath,
              args: [executablePath],
              // Chaîne vide : on n'écrit rien et on ferme. C'est tout ce que
              // voit un orphelin dont le parent a disparu.
              stdin: "",
              env: {
                ...process.env,
                T3_PROBE_INVOCATION_PATH: path.join(tempDir, "invocation.json"),
              },
            })
            .pipe(Effect.map((sortie) => ({ morte: true, code: sortie.code }))),
          // `setTimeout` brut, et c'est LE point : `Effect.sleep`, que ce
          // diagnostic recommande partout ailleurs à raison, obéirait à la
          // TestClock et n'arriverait jamais.
          // @effect-diagnostics-next-line globalTimers:off
          Effect.promise(() => new Promise((tenir) => setTimeout(tenir, 5_000))).pipe(
            Effect.as({ morte: false, code: null }),
          ),
        );

        assert.isTrue(
          verdict.morte,
          "la fausse binaire a survécu 5 s à la fermeture de stdin : elle se maintient en vie toute seule, donc une exécution de tests interrompue la laissera tourner jusqu'au redémarrage de la machine",
        );
        assert.equal(verdict.code, 0);
      }).pipe(Effect.scoped),
    );
  },
);
