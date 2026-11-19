// chat.ts — streaming fetch to /chat/completions. OpenAI-compatible only (§2).
// The one fiddly part: SSE chunks do NOT align with line boundaries, so we
// keep a line buffer and only act on complete lines (§12). Requires Node 20.6+
// (global fetch + ReadableStream).
export async function* streamChat(cfg, messages, opts = {}) {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: cfg.model, messages, stream: true }),
        signal: opts.signal,
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Chat request failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
    if (!res.body) {
        throw new Error('Chat request failed: response has no body');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            // Process only COMPLETE lines; keep the remainder in the buffer.
            let newline;
            while ((newline = buffer.indexOf('\n')) !== -1) {
                const rawLine = buffer.slice(0, newline);
                buffer = buffer.slice(newline + 1);
                const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
                if (!line.startsWith('data:'))
                    continue; // keep-alive comments (": ..."), blanks
                const data = line.slice('data:'.length).trim();
                if (data === '[DONE]')
                    return;
                let json;
                try {
                    json = JSON.parse(data);
                }
                catch {
                    continue; // partial/defensive: never crash the REPL on a bad event
                }
                const delta = json?.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length > 0) {
                    yield delta;
                }
            }
        }
    }
    finally {
        // Ensure the connection is released on abort/error/generator return.
        reader.cancel().catch(() => { });
    }
}
// ---------------------------------------------------------------------------
// SAVE_NPC — STUB ONLY. DO NOT ACTIVATE (§9).
//
// Later, activated policy: the model may emit a tagged block proposing a new
// character; we then ask the user for confirmation:
//
//   Save as character? [y/N]
//
// Never auto-save. Incidental NPCs (barkeep, guard) otherwise live only in
// history and fade out of the sliding window — that is correct behavior.
//
// function parseSaveNpcBlock(text: string): { name: string; content: string } | null {
//   const m = text.match(/\[SAVE_NPC\]([\s\S]*?)\[\/SAVE_NPC\]/);
//   if (!m) return null;
//   // TODO(v2): parse name/content, prompt "Save as character? [y/N]",
//   //           write characters/<name>.md only on explicit 'y'.
//   return null;
// }
