import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/prompt.js';

const base = {
  characterName: 'Aria',
  character: 'Aria is a sharp-tongued bard.',
  personaName: 'Kael',
  persona: 'Kael is a mercenary with a debt.',
  location: null,
  plot: null,
};

describe('buildSystemPrompt — character mode', () => {
  it('opens with the identity line', () => {
    const p = buildSystemPrompt({ ...base, mode: 'character' });
    expect(p.startsWith('You are Aria.')).toBe(true);
    expect(p).toContain('Respond only as Aria.');
  });

  it('includes character first, player second, in that order', () => {
    const p = buildSystemPrompt({ ...base, mode: 'character' });
    expect(p.indexOf('## Character')).toBeLessThan(p.indexOf('## Player'));
    expect(p).toContain('Aria is a sharp-tongued bard.');
    expect(p).toContain('The player is Kael.');
  });

  it('omits optional sections cleanly', () => {
    const p = buildSystemPrompt({ ...base, mode: 'character' });
    expect(p).not.toContain('## Location');
    expect(p).not.toContain('## Plot');
  });

  it('includes optional location and plot sections when present', () => {
    const p = buildSystemPrompt({
      ...base, mode: 'character', location: 'A smoky tavern.', plot: 'Find the lost lute.',
    });
    expect(p.indexOf('## Location')).toBeLessThan(p.indexOf('## Plot'));
    expect(p).toContain('A smoky tavern.');
    expect(p).toContain('Find the lost lute.');
  });

  it('includes loaded story history as continuing context', () => {
    const p = buildSystemPrompt({
      ...base,
      mode: 'narrator',
      storyHistory: ['Yuji and Todo are confronting Mahito in Shibuya.'],
    });
    expect(p).toContain('## Story So Far');
    expect(p).toContain('Yuji and Todo are confronting Mahito in Shibuya.');
  });

  it('shows the character roster and only applicable character details', () => {
    const p = buildSystemPrompt({
      ...base,
      mode: 'narrator',
      characterRoster: ['ariel', 'blake', 'flare', 'rem'],
      applicableCharacters: [{
        name: 'flare',
        content: 'Flare is Princess of Avax.',
      }],
    });
    expect(p).toContain('## Character Roster');
    expect(p).toContain('- flare');
    expect(p).toContain('## Applicable Character Details');
    expect(p).toContain('Flare is Princess of Avax.');
  });

  it('tells the model not to speak or act for the player (both modes)', () => {
    for (const mode of ['character', 'narrator'] as const) {
      const p = buildSystemPrompt({ ...base, mode });
      expect(p).toContain('Do not speak or act for the player.');
    }
  });

  it('specifies the asterisk/quote format', () => {
    const p = buildSystemPrompt({ ...base, mode: 'character' });
    expect(p).toContain('*asterisks*');
    expect(p).toContain('"double quotes"');
  });
});

describe('buildSystemPrompt — narrator mode', () => {
  it('uses the narrator identity and allows voicing NPCs', () => {
    const p = buildSystemPrompt({ ...base, mode: 'narrator' });
    expect(p.startsWith('You are the narrator.')).toBe(true);
    expect(p).toContain('Voice all characters except the player.');
    expect(p).not.toContain('Respond only as Aria.');
  });

  it('still includes character and player sections', () => {
    const p = buildSystemPrompt({ ...base, mode: 'narrator' });
    expect(p).toContain('## Character');
    expect(p).toContain('## Player');
  });
});
