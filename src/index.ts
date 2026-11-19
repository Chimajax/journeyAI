// index.ts — entry, REPL loop, history, session save/load, slash commands.
// §1: read line -> build messages -> stream -> print -> append. That's the app.
import readline from 'node:readline';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadConfig, type Config } from './config.js';
import {
  listFiles,
  listLocations,
  listStoryFolders,
  loadContent,
  nextNumberedJsonName,
  displayName,
  type ContentBundle,
} from './loaders.js';
import { buildSystemPrompt, trimHistory, type Turn } from './prompt.js';
import { streamChat, type ChatMessage } from './chat.js';

interface SessionFile {
  version: 1;
  storyDir?: string;
  character: string | null;
  persona: string | null;
  location: string | null;
  plot: string | null;
  model: string; // informational only — never blocks loading (§5)
  messages: Turn[];
  storyHistory?: string[];
}

interface HistoryFile {
  version: 1;
  storyDir: string;
  session?: string | null;
  model: string;
  location?: string | null;
  history: string[];
}

const config = loadConfig();
let history: Turn[] = [];
let storyHistory: string[] = [];
let currentSessionFile: string | null = null;
let content: ContentBundle = { character: null, persona: null, location: null, plot: null };
let selectionOutputLines = 0;

// ---------------------------------------------------------------------------
// Sessions (§5): one shared load function for --session and /load.
// Fail soft, never hard: missing referenced md files only warn (loaders.ts).

async function writeSessionFile(file: string): Promise<void> {
  const session: SessionFile = {
    version: 1,
    storyDir: config.storyDir,
    character: config.character,
    persona: config.persona,
    location: config.location,
    plot: config.plot,
    model: config.model,
    messages: history,
    storyHistory,
  };
  await writeFile(file, JSON.stringify(session, null, 2), 'utf8');
}

async function saveSession(): Promise<string> {
  const dir = path.join(config.storyDir, 'sessions');
  await mkdir(dir, { recursive: true }); // created on first save (§12)
  const existingFiles = await listFiles(dir, ['.json']);
  const file = path.join(dir, nextNumberedJsonName(existingFiles, 'session'));
  await writeSessionFile(file);
  currentSessionFile = file;
  return file;
}

async function loadSession(file: string): Promise<void> {
  const resolvedFile = path.isAbsolute(file) || file.includes('/') || file.includes('\\')
    ? path.resolve(process.cwd(), file)
    : path.join(config.storyDir, 'sessions', file);
  let session: SessionFile;
  try {
    session = JSON.parse(await readFile(resolvedFile, 'utf8'));
  } catch (err: any) {
    console.error(`[journeyai] could not load session "${file}": ${err?.message ?? err}`);
    return;
  }
  if (session.version !== 1 || !Array.isArray(session.messages)) {
    console.error('[journeyai] not a v1 session file; ignoring');
    return;
  }
  // model is informational only — a changed MODEL env var must not block this.
  if (session.storyDir) config.storyDir = path.resolve(session.storyDir);
  config.character = session.character;
  config.persona = session.persona;
  config.location = session.location;
  config.plot = session.plot;
  history = session.messages;
  storyHistory = Array.isArray(session.storyHistory) ? session.storyHistory : [];
  currentSessionFile = resolvedFile;
  content = await loadContent(config); // re-read md files fresh (§5)
  console.error(`[journeyai] loaded ${history.length} messages from ${resolvedFile}`);
  const recap = storyHistory.at(-1) ??
    [...history].reverse().find((turn) => turn.role === 'assistant')?.content;
  if (recap) console.log(`\n${recap}\n`);
}

async function selectAvailableFile(
  files: string[],
  title: string,
  prompt: string,
  requested: string,
): Promise<string | null> {
  if (requested) {
    const index = Number.parseInt(requested, 10);
    if (Number.isInteger(index) && String(index) === requested) {
      return files[index - 1] ?? null;
    }
    return files.find((file) => file.toLowerCase() === requested.toLowerCase()) ?? null;
  }
  if (files.length === 0) {
    console.log(`${title}: none`);
    return null;
  }
  console.log(`${title}:`);
  files.forEach((file, index) => console.log(`${index + 1}. ${file}`));
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(`[journeyai] specify a filename or number: ${prompt.toLowerCase()} <file|number>`);
    return null;
  }
  const answer = (await ask(prompt)).trim();
  const index = Number.parseInt(answer, 10);
  if (Number.isInteger(index) && String(index) === answer) {
    return files[index - 1] ?? null;
  }
  return files.find((file) => file.toLowerCase() === answer.toLowerCase()) ?? null;
}

async function loadAvailableSession(requested = ''): Promise<void> {
  if (requested.includes('/') || requested.includes('\\') || path.isAbsolute(requested)) {
    await loadSession(requested);
    return;
  }
  const directory = path.join(config.storyDir, 'sessions');
  const files = await listFiles(directory, ['.json']);
  const file = await selectAvailableFile(files, 'Sessions available', 'Session to load: ', requested);
  if (!file) {
    if (requested) console.error(`[journeyai] session "${requested}" is not available`);
    return;
  }
  await loadSession(file);
}

async function historyCommand(requested = ''): Promise<void> {
  const requestedParts = requested.trim().split(/\s+/).filter(Boolean);
  let action = requestedParts[0]?.toLowerCase() ?? '';
  if (!action) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('[journeyai] use /history save or /history load in non-interactive mode');
      return;
    }
    console.log('1. Save history');
    console.log('2. Load history');
    action = (await ask('History action: ')).trim().toLowerCase();
  }

  if (action === '1' || action === 'save') {
    const file = await saveHistory();
    console.error(`[journeyai] saved ${path.basename(file)} to ${file}`);
  } else if (action === '2' || action === 'load') {
    await loadStoryHistory(requestedParts.slice(1).join(' '));
  } else {
    console.error('[journeyai] choose 1 (save history) or 2 (load history)');
  }
}

async function showInfo(): Promise<void> {
  const [personas, locations, characters, plots, sessions, savedHistories] = await Promise.all([
    listFiles(path.join(config.storyDir, 'personas'), ['.md', '.txt']),
    listFiles(path.join(config.storyDir, 'locations'), ['.md', '.txt']),
    listFiles(path.join(config.storyDir, 'characters'), ['.md', '.txt']),
    listFiles(path.join(config.storyDir, 'plots'), ['.md', '.txt']),
    listFiles(path.join(config.storyDir, 'sessions'), ['.json']),
    listFiles(path.join(config.storyDir, 'history'), ['.json']),
  ]);
  const format = (files: string[]) => files.length > 0 ? files.join(', ') : 'none';
  const selectedFile = (files: string[], selected: string | null): string => {
    if (!selected) return 'none';
    const extension = path.extname(selected).toLowerCase();
    const stem = extension ? path.basename(selected, extension) : selected;
    const match = extension
      ? files.find((file) => file.toLowerCase() === selected.toLowerCase())
      : files.find((file) => file.toLowerCase() === `${stem}.md`) ??
        files.find((file) => file.toLowerCase() === `${stem}.txt`);
    return match ?? 'none';
  };
  console.log(`You are playing ${path.basename(config.storyDir)}`);
  console.log(`You: ${selectedFile(personas, config.persona)}`);
  console.log(`location: ${selectedFile(locations, config.location)}`);
  console.log(`Characters: ${format(characters)}`);
  console.log(`plot: ${selectedFile(plots, config.plot)}`);
  console.log(`sessions: ${format(sessions)}`);
  console.log(`history: ${format(savedHistories)}`);
}

async function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function logSelection(line: string, error = false): void {
  if (error) console.error(line);
  else console.log(line);
  if (rl.terminal) selectionOutputLines += 1;
}

async function askSelection(question: string): Promise<string> {
  if (rl.terminal) selectionOutputLines += 1;
  return ask(question);
}

function clearSelectionOutput(): void {
  if (!rl.terminal || selectionOutputLines === 0) return;
  readline.moveCursor(process.stdout, 0, -selectionOutputLines);
  readline.cursorTo(process.stdout, 0);
  readline.clearScreenDown(process.stdout);
  selectionOutputLines = 0;
}

async function chooseStoryFolder(): Promise<void> {
  if (config.session || config.storyDirSpecified) return;

  const folders = await listStoryFolders(process.cwd());
  if (folders.length === 0) {
    throw new Error('No story folders found. Create a folder for your story and try again.');
  }

  const defaultFolder = folders.includes('sample_1') ? 'sample_1' : folders[0];
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    config.storyDir = path.resolve(process.cwd(), defaultFolder);
    return;
  }

  logSelection("Select a folder you'd like to play:");
  folders.forEach((folder, index) => {
    logSelection(`${index + 1}. ${folder}${folder === defaultFolder ? ' (default)' : ''}`);
  });
  logSelection('For a new story, create a folder in the project directory.');

  for (;;) {
    const answer = (await askSelection(`Folder [${defaultFolder}]: `)).trim();
    const index = Number.parseInt(answer, 10);
    const selected = answer.length === 0
      ? defaultFolder
      : Number.isInteger(index) && String(index) === answer
        ? folders[index - 1]
        : folders.find((folder) => folder.toLowerCase() === answer.toLowerCase());
    if (selected) {
      config.storyDir = path.resolve(process.cwd(), selected);
      return;
    }
    logSelection('[journeyai] choose a listed folder or enter its name', true);
  }
}

async function chooseLocation(): Promise<void> {
  if (config.session || config.location) return;

  const locations = await listLocations(config.storyDir);
  if (locations.length === 0) {
    console.log(`[journeyai] no locations found in ${path.join(config.storyDir, 'locations')}`);
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    config.location = locations[0].preferredFile;
    return;
  }

  logSelection(`Pick a location (${locations.length} found):`);
  locations.forEach((location, index) => {
    const alternate = location.extensions.length > 1
      ? ` (also ${location.stem}.txt)`
      : '';
    logSelection(`${index + 1}. ${location.preferredFile}${alternate}`);
  });
  logSelection('For a new location, add a .md or .txt file in the locations folder.');

  for (;;) {
    const answer = (await askSelection(`Location [${locations[0].preferredFile}]: `)).trim();
    const index = Number.parseInt(answer, 10);
    let selected: string | undefined;
    if (answer.length === 0) {
      selected = locations[0].preferredFile;
    } else if (Number.isInteger(index) && String(index) === answer) {
      selected = locations[index - 1]?.preferredFile;
    } else {
      const extension = path.extname(answer).toLowerCase();
      const typedStem = extension === '.md' || extension === '.txt'
        ? answer.slice(0, -path.extname(answer).length)
        : answer;
      const choice = locations.find((location) =>
        location.stem.toLowerCase() === typedStem.toLowerCase());
      if (choice && (!extension || choice.extensions.includes(extension))) {
        selected = extension ? `${choice.stem}${extension}` : choice.preferredFile;
      }
    }
    if (selected) {
      config.location = selected;
      return;
    }
    logSelection('[journeyai] choose a listed location or enter its filename', true);
  }
}

async function chooseConversationStarter(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;

  const files = await listFiles(path.join(config.storyDir, 'history'), ['.json']);
  logSelection('How would you like to start?');
  logSelection(files.length === 0 ? '1. New Chat (No History Found)' : '1. New Chat');
  files.forEach((file, index) => logSelection(`${index + 2}. ${file}`));

  for (;;) {
    const answer = (await askSelection('Choose an option: ')).trim();
    const index = Number.parseInt(answer, 10);
    if (answer === '' || answer === '1') {
      history = [];
      storyHistory = [];
      currentSessionFile = null;
      return;
    }

    const selected = Number.isInteger(index) && String(index) === answer
      ? files[index - 2]
      : files.find((file) => file.toLowerCase() === answer.toLowerCase());
    if (selected && await loadStoryHistory(selected, false)) return;
    logSelection('[journeyai] choose a listed history or New Chat', true);
  }
}

// ---------------------------------------------------------------------------
// One assistant turn: build prompt -> stream -> print -> commit history.
// Failure semantics (§12): on stream failure or abort, DISCARD the partial
// assistant message AND the user message, so history never holds a dangling
// turn and always alternates cleanly.
async function runTurn(line: string, signal: AbortSignal): Promise<void> {
  const system = buildSystemPrompt({
    mode: config.mode,
    characterName: displayName(config.character),
    character: content.character,
    personaName: displayName(config.persona),
    persona: content.persona,
    location: content.location,
    plot: content.plot,
    storyHistory,
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...trimHistory(history, config.maxTurns),
    { role: 'user', content: line },
  ];

  let reply = '';
  try {
    for await (const token of streamChat(config, messages, { signal })) {
      reply += token;
      process.stdout.write(token); // unbuffered per-token streaming
    }
    process.stdout.write('\n');
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      process.stdout.write('\n[journeyai] aborted\n');
    } else {
      process.stdout.write(`\n[journeyai] error: ${err?.message ?? err}\n`);
    }
    return; // discard both sides of the turn
  }

  history.push({ role: 'user', content: line });
  history.push({ role: 'assistant', content: reply });
}

async function saveHistory(): Promise<string> {
  let sessionFile = currentSessionFile;
  if (!sessionFile) sessionFile = await saveSession();

  const prompt = [
    'Summarize the roleplay so far for future continuation.',
    'Keep important events, character relationships, unresolved goals, and current scene state.',
    'Do not invent events. Return only the summary, without a heading or markdown code fence.',
  ].join(' ');
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt },
    {
      role: 'user',
      content: [
        `Story: ${path.basename(config.storyDir)}`,
        content.plot ? `Plot:\n${content.plot}` : '',
        content.location ? `Location:\n${content.location}` : '',
        storyHistory.length ? `Previously saved story history:\n${storyHistory.join('\n\n')}` : '',
        history.length
          ? `Conversation so far:\n${history.map((turn) => `${turn.role}: ${turn.content}`).join('\n\n')}`
          : 'No conversation turns have been played yet.',
        'Write the updated concise story summary now.',
      ].filter(Boolean).join('\n\n'),
    },
  ];

  let summary = '';
  for await (const token of streamChat(config, messages)) summary += token;
  summary = summary.trim();
  if (!summary) throw new Error('The model returned an empty history summary');

  const directory = path.join(config.storyDir, 'history');
  await mkdir(directory, { recursive: true });
  const existingFiles = await listFiles(directory, ['.json']);
  const name = nextNumberedJsonName(existingFiles, 'history');
  const file = path.join(directory, name);
  const record: HistoryFile = {
    version: 1,
    storyDir: config.storyDir,
    session: path.relative(directory, sessionFile),
    model: config.model,
    location: await selectedContentFilename(path.join(config.storyDir, 'locations'), config.location),
    history: [summary],
  };
  await writeFile(file, JSON.stringify(record, null, 2), 'utf8');
  storyHistory = [summary];
  await writeSessionFile(sessionFile);
  return file;
}

async function selectedContentFilename(directory: string, selected: string | null): Promise<string | null> {
  if (!selected) return null;
  const files = await listFiles(directory, ['.md', '.txt']);
  const extension = path.extname(selected).toLowerCase();
  const stem = extension ? path.basename(selected, extension) : selected;
  if (extension) {
    return files.find((file) => file.toLowerCase() === selected.toLowerCase()) ?? null;
  }
  return files.find((file) => file.toLowerCase() === `${stem}.md`) ??
    files.find((file) => file.toLowerCase() === `${stem}.txt`) ??
    null;
}

async function loadStoryHistory(requested = '', display = true): Promise<boolean> {
  const directory = path.join(config.storyDir, 'history');
  const files = await listFiles(directory, ['.json']);
  const file = await selectAvailableFile(files, 'History available', 'History to load: ', requested);
  if (!file) {
    if (requested) console.error(`[journeyai] history "${requested}" is not available`);
    return false;
  }

  const fullPath = path.join(directory, file);
  try {
    const saved: HistoryFile = JSON.parse(await readFile(fullPath, 'utf8'));
    if (saved.version !== 1 || !Array.isArray(saved.history) ||
        !saved.history.every((item) => typeof item === 'string')) {
      throw new Error('invalid history file format');
    }
    if (saved.location) config.location = saved.location;
    storyHistory = saved.history;
    history = [];
    content = await loadContent(config);
    currentSessionFile = saved.session
      ? path.resolve(path.dirname(fullPath), saved.session)
      : null;
    if (currentSessionFile) {
      try {
        await access(currentSessionFile);
      } catch (err: any) {
        if (err?.code === 'ENOENT') currentSessionFile = null;
        else throw err;
      }
    }
  } catch (err: any) {
    console.error(`[journeyai] could not load history "${file}": ${err?.message ?? err}`);
    return false;
  }

  if (display) {
    console.log(`[journeyai] loaded ${file} from ${fullPath}`);
    console.log(`\n${storyHistory.join('\n\n')}\n`);
  }
  return true;
}

async function startRoleplay(): Promise<void> {
  if (!content.plot) return;
  process.stdout.write('\n');
  abort = new AbortController();
  try {
    await runTurn(
      'Begin the roleplay with an opening scene based on the plot and selected location. ' +
      'Establish the current situation and introduce relevant characters, but do not ' +
      "decide or narrate the player's actions, dialogue, thoughts, or feelings. Leave " +
      'an opening for the player to respond.',
      abort.signal,
    );
  } finally {
    abort = null;
  }
  process.stdout.write('\n');
}

// ---------------------------------------------------------------------------
// Slash commands (§7). Register here; adding one is one map entry.
const commands: Record<string, (arg: string) => Promise<void> | void> = {
  '/exit': async () => {
    const file = await saveSession();
    console.error(`[journeyai] saved to ${file}`);
    rl.close();
  },
  '/save': async () => {
    const file = await saveSession();
    try {
      const historyFile = await saveHistory();
      console.error(`[journeyai] saved ${path.basename(historyFile)} to ${historyFile}`);
    } catch (err: any) {
      console.error(`[journeyai] history could not be saved: ${err?.message ?? err}`);
    }
    console.error(`[journeyai] saved to ${file}`);
  },
  '/load': async (arg) => {
    await loadAvailableSession(arg.trim());
  },
  '/info': async () => {
    await showInfo();
  },
  '/history': async (arg) => {
    await historyCommand(arg);
  },
  '/reload': async () => {
    content = await loadContent(config); // pick up edited md files, cheap
    console.error('[journeyai] reloaded content files');
  },
  '/help': () => {
    console.error(`Commands: ${Object.keys(commands).join(', ')}
/load [file|number]  list or load a session from this story's sessions folder
/info                show this story's files
/history [save|load] save or load a compact story history`);
  },
};

// ---------------------------------------------------------------------------
// REPL
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
let abort: AbortController | null = null;

rl.on('SIGINT', () => {
  // Ctrl+C mid-stream: abort the fetch, discard the partial turn (§12).
  if (abort) {
    abort.abort();
    abort = null;
    return;
  }
  // Ctrl+C at an empty prompt: save and leave.
  void (async () => {
    try {
      const file = await saveSession();
      console.error(`\n[journeyai] saved to ${file}`);
    } finally {
      process.exit(0);
    }
  })();
});

async function main(): Promise<void> {
  if (!config.apiKey) {
    console.error('[journeyai] warning: API_KEY is empty — requests will likely fail');
  }
  if (config.session) {
    await loadSession(config.session); // --session resume (§11)
  } else {
    await chooseStoryFolder();
    await chooseLocation();
    content = await loadContent(config);
    await chooseConversationStarter();
    clearSelectionOutput();
  }

  console.log(`You are now playing: ${path.basename(config.storyDir)}`);
  if (!config.session) await startRoleplay();

  rl.prompt();
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      rl.prompt();
      return;
    }
    if (trimmed.startsWith('/')) {
      const [cmd, ...rest] = trimmed.split(/\s+/);
      const handler = commands[cmd];
      if (handler) {
        Promise.resolve(handler(rest.join(' '))).catch((err) => {
          console.error(`[journeyai] command failed: ${err?.message ?? err}`);
        }).then(() => {
          if (rl.terminal) rl.prompt();
        });
      } else {
        console.error(`[journeyai] unknown command "${cmd}" — try /help`);
        rl.prompt();
      }
      return;
    }

    abort = new AbortController();
    runTurn(trimmed, abort.signal)
      .catch((err) => console.error(`[journeyai] error: ${err?.message ?? err}`))
      .finally(() => {
        abort = null;
        rl.prompt();
      });
  });

  rl.on('close', () => process.exit(0));
}

main().catch((err) => {
  console.error(`[journeyai] fatal: ${err?.message ?? err}`);
  process.exit(1);
});
