// prompt.ts — pure functions, no I/O, no fetch (§11).
// The system prompt is rebuilt from content files EVERY turn (§2); never cached.
const FORMAT_RULES = `## Format
Use *asterisks* for actions and "double quotes" for speech.
Stay in character. Do not speak or act for the player.
Do not decide the player's actions, words, thoughts, or feelings.`;
export function buildSystemPrompt(input) {
    const sections = [];
    if (input.mode === 'narrator') {
        // Narrator mode: one voice for the world; the player stays off-limits.
        // This is what makes multi-character replies work (§6).
        sections.push(`You are the narrator. Voice all characters except the player.
` +
            `Describe actions and speak as any NPC.`);
    }
    else {
        sections.push(`You are ${input.characterName ?? 'the character'}. ` +
            `Respond only as ${input.characterName ?? 'the character'}. ` +
            `Do not speak or act for other characters or the player.`);
    }
    if (input.character) {
        sections.push(`## Character
${input.character.trim()}`);
    }
    if (input.persona) {
        sections.push(`## Player
The player is ${input.personaName ?? 'the player'}.
${input.persona.trim()}`);
    }
    if (input.location) {
        sections.push(`## Location
${input.location.trim()}`);
    }
    if (input.plot) {
        sections.push(`## Plot
${input.plot.trim()}`);
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
export function trimHistory(history, maxTurns) {
    if (maxTurns < 1)
        return [];
    // History is built in complete pairs, but be defensive about a stray
    // trailing user message: count complete pairs only.
    const pairCount = Math.floor(history.length / 2);
    if (pairCount <= maxTurns)
        return history.slice();
    const recentPairs = maxTurns - 1;
    const head = history.slice(0, 2); // first pair
    const tail = history.slice(history.length - recentPairs * 2); // recent pairs
    return [...head, ...tail];
}
