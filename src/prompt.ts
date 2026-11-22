// prompt.ts — pure functions, no I/O, no fetch (§11).
// The system prompt is rebuilt from content files EVERY turn (§2); never cached.

export type Role = 'user' | 'assistant';
export interface Turn {
  role: Role;
  content: string;
}

export type Mode = 'character' | 'narrator';
export interface CharacterContext {
  name: string;
  content: string;
}

export interface PromptInput {
  mode: Mode;
  characterName: string | null;   // display name from filename stem
  character: string | null;       // raw markdown, null if file missing
  personaName: string | null;
  persona: string | null;
  location: string | null;        // optional — omitted cleanly when null
  plot: string | null;            // optional — omitted cleanly when null
  storyHistory?: string[];
  characterRoster?: string[];
  applicableCharacters?: CharacterContext[];
}

const FORMAT_RULES = `## Format
Use *asterisks* for actions and "double quotes" for speech.
Stay in character. Do not speak or act for the player.
Do not decide the player's actions, words, thoughts, or feelings.`;

export function buildSystemPrompt(input: PromptInput): string {
  const sections: string[] = [];

  if (input.mode === 'narrator') {
    // Narrator mode: one voice for the world; the player stays off-limits.
    // This is what makes multi-character replies work (§6).
    sections.push(
      `You are the narrator. Voice all characters except the player.
` +
      `Describe actions and speak as any NPC.`
    );
  } else {
    sections.push(
      `You are ${input.characterName ?? 'the character'}. ` +
      `Respond only as ${input.characterName ?? 'the character'}. ` +
      `Do not speak or act for other characters or the player.`
    );
  }

  if (input.character) {
    sections.push(`## Character
${input.character.trim()}`);
  }

  if (input.persona) {
    sections.push(
      `## Player
The player is ${input.personaName ?? 'the player'}.
${input.persona.trim()}`
    );
  }

  if (input.location) {
    sections.push(`## Location
${input.location.trim()}`);
  }

  if (input.plot) {
    sections.push(`## Plot
${input.plot.trim()}`);
  }

  if (input.characterRoster?.length) {
    sections.push(`## Character Roster
${input.characterRoster.map((name) => `- ${name}`).join('\n')}
Only load and use the full details for characters explicitly present or applicable to the current scene.`);
  }

  if (input.applicableCharacters?.length) {
    sections.push(`## Applicable Character Details
${input.applicableCharacters.map((character) =>
  `### ${character.name}\n${character.content.trim()}`
).join('\n\n')}`);
  }

  if (input.storyHistory?.length) {
    sections.push(`## Story So Far
${input.storyHistory.join('\n\n')}`);
  }

  sections.push(FORMAT_RULES);
  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Sliding window (§5 + §12 amendments).
// A "turn" is one user+assistant PAIR. History alternates user, assistant.
// Trimming drops whole pairs from the front so the window can never contain
// two consecutive same-role messages — some OpenAI-compatible providers
// reject that. We keep the first pair (it often holds scene setup) plus the
// most recent maxTurns-1 pairs.
export function trimHistory(history: Turn[], maxTurns: number): Turn[] {
  if (maxTurns < 1) return [];
  // History is built in complete pairs, but be defensive about a stray
  // trailing user message: count complete pairs only.
  const pairCount = Math.floor(history.length / 2);
  if (pairCount <= maxTurns) return history.slice();
  const recentPairs = maxTurns - 1;
  const head = history.slice(0, 2);                          // first pair
  const tail = history.slice(history.length - recentPairs * 2); // recent pairs
  return [...head, ...tail];
}
