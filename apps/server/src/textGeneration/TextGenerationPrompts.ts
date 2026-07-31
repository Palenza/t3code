/**
 * Shared prompt builders for text generation providers.
 *
 * Extracts the prompt construction logic that is identical across
 * Codex, Claude, and any future CLI-based text generation backends.
 *
 * @module textGenerationPrompts
 */
import * as Schema from "effect/Schema";
import type { ChatAttachment } from "@t3tools/contracts";

import { limitSection } from "./TextGenerationUtils.ts";
import type { TextGenerationPolicy } from "./TextGenerationPolicy.ts";

const EARLIER_CONTENT_TRUNCATION_MARKER = "[Earlier content truncated]\n\n";

function policyInstruction(instruction: string | undefined): ReadonlyArray<string> {
  const trimmed = instruction?.trim();
  return trimmed ? ["", "Additional instructions:", limitSection(trimmed, 4_000)] : [];
}

// ---------------------------------------------------------------------------
// Commit message
// ---------------------------------------------------------------------------

export interface CommitMessagePromptInput {
  branch: string | null;
  stagedSummary: string;
  stagedPatch: string;
  includeBranch?: boolean;
  policy?: TextGenerationPolicy | undefined;
}

export function buildCommitMessagePrompt(input: CommitMessagePromptInput) {
  const wantsBranch = input.includeBranch === true;

  const prompt = [
    "You write concise git commit messages.",
    wantsBranch
      ? "Return a JSON object with keys: subject, body, branch."
      : "Return a JSON object with keys: subject, body.",
    "Rules:",
    "- subject must be imperative, <= 72 chars, and no trailing period",
    "- body can be empty string or short bullet points",
    ...(wantsBranch
      ? ["- branch must be a short semantic git branch fragment for this change"]
      : []),
    "- capture the primary user-visible or developer-visible change",
    ...policyInstruction(input.policy?.commitInstructions),
    "",
    `Branch: ${input.branch ?? "(detached)"}`,
    "",
    "Staged files:",
    limitSection(input.stagedSummary, 6_000),
    "",
    "Staged patch:",
    limitSection(input.stagedPatch, 40_000),
  ].join("\n");

  if (wantsBranch) {
    return {
      prompt,
      outputSchema: Schema.Struct({
        subject: Schema.String,
        body: Schema.String,
        branch: Schema.String,
      }),
    };
  }

  return {
    prompt,
    outputSchema: Schema.Struct({
      subject: Schema.String,
      body: Schema.String,
    }),
  };
}

// ---------------------------------------------------------------------------
// Change request content
// ---------------------------------------------------------------------------

export interface PrContentPromptInput {
  baseBranch: string;
  headBranch: string;
  commitSummary: string;
  diffSummary: string;
  diffPatch: string;
  changeRequestTemplate?: string | undefined;
  policy?: TextGenerationPolicy | undefined;
}

export function buildPrContentPrompt(input: PrContentPromptInput) {
  const changeRequestTemplate = input.changeRequestTemplate?.trim();
  const bodyRules = changeRequestTemplate
    ? [
        "- body must be markdown and follow the repository change request template structure",
        "- fill in the template sections appropriately for this change",
        "- drop HTML comments from the template in the generated body",
        "- keep the template's markdown structure",
      ]
    : [
        "- body must be markdown and include headings '## Summary' and '## Testing'",
        "- under Summary, provide short bullet points",
        "- under Testing, include bullet points with concrete checks or 'Not run' where appropriate",
      ];
  const prompt = [
    "You write source control change request content.",
    "Return a JSON object with keys: title, body.",
    "Rules:",
    "- title should be concise and specific",
    ...bodyRules,
    ...policyInstruction(input.policy?.changeRequestInstructions),
    ...(changeRequestTemplate
      ? ["", "Repository change request template:", limitSection(changeRequestTemplate, 8_000)]
      : []),
    "",
    `Base branch: ${input.baseBranch}`,
    `Head branch: ${input.headBranch}`,
    "",
    "Commits:",
    limitSection(input.commitSummary, 12_000),
    "",
    "Diff stat:",
    limitSection(input.diffSummary, 12_000),
    "",
    "Diff patch:",
    limitSection(input.diffPatch, 40_000),
  ].join("\n");

  const outputSchema = Schema.Struct({
    title: Schema.String,
    body: Schema.String,
  });

  return { prompt, outputSchema };
}

// ---------------------------------------------------------------------------
// Branch name
// ---------------------------------------------------------------------------

export interface BranchNamePromptInput {
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  policy?: TextGenerationPolicy | undefined;
}

interface PromptFromMessageInput {
  instruction: string;
  responseShape: string;
  rules: ReadonlyArray<string>;
  message: string;
  messageLabel?: string | undefined;
  preserveMessageEnd?: boolean | undefined;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  additionalInstructions?: string | undefined;
}

function preserveMessageEnd(message: string): string {
  const alreadyTruncated = message.startsWith(EARLIER_CONTENT_TRUNCATION_MARKER);
  const contents = alreadyTruncated
    ? message.slice(EARLIER_CONTENT_TRUNCATION_MARKER.length)
    : message;
  if (!alreadyTruncated && contents.length <= 8_000) {
    return contents;
  }
  return `${EARLIER_CONTENT_TRUNCATION_MARKER}${contents.slice(-8_000)}`;
}

function buildPromptFromMessage(input: PromptFromMessageInput): string {
  const attachmentLines = (input.attachments ?? []).map(
    (attachment) => `- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`,
  );

  const promptSections = [
    input.instruction,
    input.responseShape,
    "Rules:",
    ...input.rules.map((rule) => `- ${rule}`),
    "",
    `${input.messageLabel ?? "User message"}:`,
    input.preserveMessageEnd
      ? preserveMessageEnd(input.message)
      : limitSection(input.message, 8_000),
    ...policyInstruction(input.additionalInstructions),
  ];
  if (attachmentLines.length > 0) {
    promptSections.push(
      "",
      "Attachment metadata:",
      limitSection(attachmentLines.join("\n"), 4_000),
    );
  }

  return promptSections.join("\n");
}

export function buildBranchNamePrompt(input: BranchNamePromptInput) {
  const prompt = buildPromptFromMessage({
    instruction: "You generate concise git branch names.",
    responseShape: "Return a JSON object with key: branch.",
    rules: [
      "Branch should describe the requested work from the user message.",
      "Keep it short and specific (2-6 words).",
      "Use plain words only, no issue prefixes and no punctuation-heavy text.",
      "If images are attached, use them as primary context for visual/UI issues.",
    ],
    message: input.message,
    attachments: input.attachments,
    additionalInstructions: input.policy?.branchInstructions,
  });
  const outputSchema = Schema.Struct({
    branch: Schema.String,
  });

  return { prompt, outputSchema };
}

// ---------------------------------------------------------------------------
// Thread title
// ---------------------------------------------------------------------------

export interface ThreadTitlePromptInput {
  message: string;
  previousTitle?: string | undefined;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  policy?: TextGenerationPolicy | undefined;
}

export function buildThreadTitlePrompt(input: ThreadTitlePromptInput) {
  const isRegeneration = input.previousTitle !== undefined;
  const prompt = buildPromptFromMessage({
    instruction: isRegeneration
      ? [
          "You write concise thread titles for coding conversations.",
          "The user requested a new title based on the contents of this thread.",
          `The previous title was ${JSON.stringify(input.previousTitle)}.`,
          "Come up with a new title that better represents the current state of the thread.",
        ].join("\n")
      : "You write concise thread titles for coding conversations.",
    responseShape: "Return a JSON object with key: title.",
    rules: [
      isRegeneration
        ? "Title should summarize the thread's current state, not just its initial request."
        : "Title should summarize the user's request, not restate it verbatim.",
      ...(isRegeneration
        ? [
            "Capture the thread's intent, not a PR number or other superficial detail.",
            "Return a different title from the previous title.",
          ]
        : []),
      "Keep it short and specific (3-8 words).",
      "Avoid quotes, filler, prefixes, and trailing punctuation.",
      "If images are attached, use them as primary context for visual/UI issues.",
    ],
    message: input.message,
    ...(isRegeneration
      ? {
          messageLabel: "Thread contents",
          preserveMessageEnd: true,
        }
      : {}),
    attachments: input.attachments,
    additionalInstructions: input.policy?.threadTitleInstructions,
  });
  const outputSchema = Schema.Struct({
    title: Schema.String,
  });

  return { prompt, outputSchema };
}

export interface ThreadGroupingPromptInput {
  /**
   * Les fils à ranger : un identifiant + son titre, rien de plus.
   *
   * `settled` marque les fils DORMANTS (rangés, terminés). Ils comptent
   * autant que les actifs — c'est même là que le désordre s'accumule chez
   * quelqu'un qui utilise l'app depuis des mois (retour fondateur 29/07) —
   * mais leur état ne change JAMAIS : ranger n'est pas réveiller.
   */
  readonly threads: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly settled?: boolean | undefined;
  }>;
}

/**
 * Le « Tidy » d'Arc, transposé aux fils (demande fondateur 29/07, vidéo
 * décortiquée) : un JUGE SÉMANTIQUE regroupe les fils ouverts par thème et
 * nomme chaque groupe. Jamais de mots-clés ni de regex — c'est du sens, pas
 * du texte. Les groupes sont une PROPOSITION : l'utilisateur en accepte
 * certains, en rejette d'autres, comme chez Arc.
 */
export function buildThreadGroupingPrompt(input: ThreadGroupingPromptInput) {
  const listing = input.threads
    .map(
      (thread) =>
        `${thread.id}\t${thread.settled === true ? "[dormant] " : ""}${thread.title
          .replace(/\s+/g, " ")
          .slice(0, 140)}`,
    )
    .join("\n");
  const prompt = [
    "You group a developer's open conversation threads by THEME, the way Arc's Tidy groups browser tabs.",
    "",
    "Rules:",
    "- Group by what the work is ABOUT (subject matter, feature area, product), never by wording overlap.",
    "- 2 to 6 groups. Every group needs at least 2 threads; leave the rest ungrouped.",
    "- Name each group like a folder a human would create: 2-4 words, no punctuation, in the language of the titles.",
    "- Use each thread id at most once. Never invent an id.",
    "- If nothing groups meaningfully, return an empty groups array — say so rather than forcing groups.",
    "- [dormant] threads are settled/archived work. Group them like any other: they carry the most history. Never treat dormancy as a theme, and never let it split an otherwise coherent group.",
    "",
    "Return a JSON object with key: groups — an array of objects with keys: name, threadIds.",
    "",
    "Threads (id, tab, title):",
    listing,
  ].join("\n");
  const outputSchema = Schema.Struct({
    groups: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        threadIds: Schema.Array(Schema.String),
      }),
    ),
  });
  return { prompt, outputSchema };
}
