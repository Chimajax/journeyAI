import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  listLocations,
  listStoryFolders,
  loadApplicableCharacters,
  loadCharacterCatalog,
  loadContent,
  nextNumberedJsonName,
} from '../src/loaders.js';

describe('numbered save filenames', () => {
  it('uses the first unused numbered name and leaves renamed files alone', () => {
    expect(nextNumberedJsonName([], 'session')).toBe('session1.json');
    expect(nextNumberedJsonName(
      ['session1.json', 'session_heated.json', 'session3.json'],
      'session',
    )).toBe('session4.json');
    expect(nextNumberedJsonName(['history1.json'], 'history')).toBe('history2.json');
  });
});

describe('story discovery', () => {
  it('lists story folders but excludes app and dependency directories', async () => {
    const folders = await listStoryFolders(process.cwd());
    expect(folders).toContain('story_sample_1');
    expect(folders).toContain('story_shibuya_end_fight');
    for (const excluded of ['dist', 'node_modules', 'src', 'tests']) {
      expect(folders).not.toContain(excluded);
    }
    expect(folders).not.toContain('journeyAI');
  });

  describe('character context', () => {
    it('lists all character names but loads full details only for applicable characters', async () => {
      const storyDir = path.resolve(process.cwd(), 'story_demon_hunter');
      const roster = await loadCharacterCatalog(storyDir);
      expect(roster).toEqual(['ariel', 'blake', 'flare', 'rem']);

      const flare = await loadApplicableCharacters(storyDir, null, 'Flare steps forward.');
      expect(flare.map((character) => character.name)).toEqual(['flare']);
      expect(flare[0].content).toContain('Princess of Avax');

      const noCharacter = await loadApplicableCharacters(storyDir, null, 'The forest is quiet.');
      expect(noCharacter).toEqual([]);
    });
  });

  it('lists location files and prefers markdown when available', async () => {
    const locations = await listLocations(path.resolve(process.cwd(), 'story_shibuya_end_fight'));
    expect(locations).toEqual([{
      stem: 'shibuya',
      preferredFile: 'shibuya.md',
      extensions: ['.md'],
    }]);
  });
});

describe('loadContent', () => {
  it('loads txt files and prefers markdown when both extensions exist', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'journeyai-content-'));
    const storyDir = path.join(root, 'story');
    const directories = ['characters', 'personas', 'locations', 'plots'];
    try {
      await Promise.all(directories.map((name) =>
        mkdir(path.join(storyDir, name), { recursive: true })));
      await Promise.all([
        writeFile(path.join(storyDir, 'characters', 'npc.txt'), 'text character'),
        writeFile(path.join(storyDir, 'personas', 'user.txt'), 'text persona'),
        writeFile(path.join(storyDir, 'locations', 'harbor.txt'), 'text location'),
        writeFile(path.join(storyDir, 'plots', 'plot.txt'), 'text plot'),
      ]);

      const cfg = {
        storyDir,
        character: 'npc',
        persona: 'user',
        location: 'harbor',
        plot: 'plot',
      };
      expect(await listLocations(storyDir)).toEqual([{
        stem: 'harbor',
        preferredFile: 'harbor.txt',
        extensions: ['.txt'],
      }]);
      let content = await loadContent(cfg);
      expect(content).toEqual({
        character: 'text character',
        persona: 'text persona',
        location: 'text location',
        plot: 'text plot',
      });

      await Promise.all([
        writeFile(path.join(storyDir, 'characters', 'npc.md'), 'markdown character'),
        writeFile(path.join(storyDir, 'personas', 'user.md'), 'markdown persona'),
        writeFile(path.join(storyDir, 'locations', 'harbor.md'), 'markdown location'),
        writeFile(path.join(storyDir, 'plots', 'plot.md'), 'markdown plot'),
      ]);
      content = await loadContent(cfg);
      expect(content).toEqual({
        character: 'markdown character',
        persona: 'markdown persona',
        location: 'markdown location',
        plot: 'markdown plot',
      });

      content = await loadContent({
        ...cfg,
        character: 'npc.txt',
        persona: 'user.txt',
        location: 'harbor.txt',
        plot: 'plot.txt',
      });
      expect(content).toEqual({
        character: 'text character',
        persona: 'text persona',
        location: 'text location',
        plot: 'text plot',
      });

      expect(await listLocations(storyDir)).toEqual([{
        stem: 'harbor',
        preferredFile: 'harbor.md',
        extensions: ['.md', '.txt'],
      }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses the default persona and plot while leaving character unset', async () => {
    const config = loadConfig([
      '--story', 'story_shibuya_end_fight',
      '--location', 'shibuya',
    ]);
    const content = await loadContent(config);

    expect(config.character).toBeNull();
    expect(config.persona).toBe('user');
    expect(config.plot).toBe('plot');
    expect(content.character).toBeNull();
    expect(content.persona).toContain('User');
    expect(content.location).toContain('Shibuya');
    expect(content.plot).toContain('Shibuya Confrontation');
  });

  it('loads content from the selected story folder', async () => {
    const content = await loadContent({
      storyDir: path.resolve(process.cwd(), 'story_shibuya_end_fight'),
      character: 'mahito',
      persona: 'user',
      location: 'shibuya',
      plot: 'plot',
    });

    expect(content.character).toContain('Mahito');
    expect(content.persona).toContain('User');
    expect(content.location).toContain('Shibuya');
    expect(content.plot).toContain('Shibuya Confrontation');
  });
});
