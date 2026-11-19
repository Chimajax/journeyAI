import { describe, it, expect } from 'vitest';
import { trimHistory, type Turn } from '../src/prompt.js';

function makeHistory(pairs: number): Turn[] {
  const h: Turn[] = [];
  for (let i = 0; i < pairs; i++) {
    h.push({ role: 'user', content: `u${i}` });
    h.push({ role: 'assistant', content: `a${i}` });
  }
  return h;
}

describe('trimHistory — a turn is one user+assistant pair', () => {
  it('returns a copy unchanged when within the window', () => {
    const h = makeHistory(3);
    const t = trimHistory(h, 20);
    expect(t).toEqual(h);
    expect(t).not.toBe(h);
  });

  it('never produces consecutive same-role messages', () => {
    for (const pairs of [5, 21, 50]) {
      for (const maxTurns of [1, 2, 20]) {
        const t = trimHistory(makeHistory(pairs), maxTurns);
        expect(t.length % 2).toBe(0);
        for (let i = 0; i < t.length; i++) {
          expect(t[i].role).toBe(i % 2 === 0 ? 'user' : 'assistant');
        }
      }
    }
  });

  it('keeps the first pair plus the most recent maxTurns-1 pairs', () => {
    const t = trimHistory(makeHistory(10), 3);
    expect(t.map((m) => m.content)).toEqual(['u0', 'a0', 'u8', 'a8', 'u9', 'a9']);
  });

  it('keeps exactly one pair when maxTurns is 1', () => {
    const t = trimHistory(makeHistory(5), 1);
    expect(t).toEqual([
      { role: 'user', content: 'u0' },
      { role: 'assistant', content: 'a0' },
    ]);
  });

  it('ignores a dangling trailing user message when counting pairs', () => {
    const h = [...makeHistory(4), { role: 'user' as const, content: 'u4' }];
    const t = trimHistory(h, 20); // 4 complete pairs <= 20 → returned as-is
    expect(t).toEqual(h);
  });

  it('returns empty for maxTurns < 1', () => {
    expect(trimHistory(makeHistory(3), 0)).toEqual([]);
  });
});
