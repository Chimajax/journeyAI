// config.ts — read env + CLI flags. No other file reads process.env.
// CLI flags override env where both exist (§8).
import { parseArgs } from 'node:util';
import path from 'node:path';
function str(v, fallback) {
    return v && v.length > 0 ? v : fallback;
}
export function loadConfig(argv = process.argv.slice(2)) {
    const { values } = parseArgs({
        args: argv,
        options: {
            story: { type: 'string' },
            character: { type: 'string' },
            persona: { type: 'string' },
            location: { type: 'string' },
            plot: { type: 'string' },
            mode: { type: 'string' },
            session: { type: 'string' },
            help: { type: 'boolean', short: 'h' },
        },
        allowPositionals: false,
    });
    if (values.help) {
        console.log(`Usage: npm run dev -- [flags]
  --story <folder>      story folder (default: choose interactively)
  --character <name>   characters/<name>.md or .txt (default: none)
  --persona <name>     personas/<name>.md or .txt (default: user)
  --location <name>    locations/<name>.md or .txt (default: choose interactively)
  --plot <name>        plots/<name>.md or .txt (default: plot)
  --mode <mode>        narrator (default) | character
  --session <path>     resume a saved session file
  -h, --help           this message`);
        process.exit(0);
    }
    const mode = values.mode ?? 'narrator';
    if (mode !== 'character' && mode !== 'narrator') {
        throw new Error(`--mode must be "character" or "narrator", got "${mode}"`);
    }
    const maxTurns = Number.parseInt(str(process.env.MAX_TURNS, '20'), 10);
    if (!Number.isFinite(maxTurns) || maxTurns < 1) {
        throw new Error(`MAX_TURNS must be a positive integer, got "${process.env.MAX_TURNS}"`);
    }
    const storyDirValue = values.story ?? str(process.env.STORY_DIR, 'sample_1');
    return {
        baseUrl: str(process.env.BASE_URL, 'https://api.openai.com/v1').replace(/\/+$/, ''),
        model: str(process.env.MODEL, 'gpt-4o-mini'),
        apiKey: str(process.env.API_KEY, ''),
        maxTurns,
        mode,
        storyDir: path.resolve(process.cwd(), storyDirValue),
        storyDirSpecified: values.story !== undefined || Boolean(process.env.STORY_DIR),
        character: values.character ?? null,
        persona: values.persona ?? 'user',
        location: values.location ?? null,
        plot: values.plot ?? 'plot',
        session: values.session ?? null,
    };
}
