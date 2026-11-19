import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults to narrator mode and the sample_1 story folder', () => {
    const previousStoryDir = process.env.STORY_DIR;
    delete process.env.STORY_DIR;
    try {
      const config = loadConfig([]);
      expect(config.mode).toBe('narrator');
      expect(config.storyDir).toBe(path.resolve(process.cwd(), 'sample_1'));
      expect(config.storyDirSpecified).toBe(false);
      expect(config.character).toBeNull();
      expect(config.persona).toBe('user');
      expect(config.plot).toBe('plot');
    } finally {
      if (previousStoryDir === undefined) delete process.env.STORY_DIR;
      else process.env.STORY_DIR = previousStoryDir;
    }
  });

  it('uses the selected story folder and mode flags', () => {
    const config = loadConfig(['--story', 'shibuya_end_fight', '--mode', 'character']);
    expect(config.storyDir).toBe(path.resolve(process.cwd(), 'shibuya_end_fight'));
    expect(config.storyDirSpecified).toBe(true);
    expect(config.mode).toBe('character');
  });
});
