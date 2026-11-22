# JourneyAI

A Terminal roleplay AI. You type, an OpenAI-compatible LLM answers in
character, streamed to stdout. No UI, no database. Files are the source
of truth. 

i made this to be simple and no complicated setup. unlike the confusing ones that still crash.
**Give a Star if you found this simple and useful**

> License is [MIT](./LICENSE)

## Quick start

The Requirement is simple, you need **Node 20.6+**.

For a Quick Start you can play my `story_shibuya_end_fight`

```bash
# Clone The Repo
git clone https://github.com/Chimajax/journeyAI.git

# Enter the Folder
cd journeyAI

#install Depenedcies
npm install

# Copy .env.example to .env and add your API Key and Provider
cp .env.example .env

#Run Development
npm run dev

# The Stories should come up
# you pick the one you want
```

Requires Node 20.6+ (uses `--env-file` and `util.parseArgs`).

## Quick Notes
Advice: Use Markdown files for Important details that will remain accross every chat, like `plot`, `user` or character files

0. You can totally edit any Markdown File to info you want the AI to know

1. i already dropped `story_kael` and `story_shibuya_end_fight` as samples, you can start and use them on the Go, to test the feel

2. if you want to create a new story, copy `story_sample_1` and change the details
* events will be saved in `/sessions` and `/history` folders

3. But if you want to manually create a new story, i'll advise you create a new folder with the prefix of `story_` then your story name. example `story_the_lost_dragon`. and 6 folders must be present inside your story folder...

* "./plot" and inside it, should be a `plot.md` file
* "./personas" and inside it should be a `user.md` file
* "./locations" and inside it, you can list many locations. eg `huxville.md`
* "./characters" and you can create as many characters as you want. eg `alex.md`, `blake.md`
* if you have an artefact, maybe a flying sword, you can put it in "/characters" and name it, maybe `saber.md` describe that it is a sword and not a person
* "./sessions" and you leave this, the system handles it
* "./history" and you leave this, the system handles it

for commands see [Commands](#commands)

## Layout

- `<story>/characters/<name>.md` or `.txt` — one NPC per file; the filename is the identifier.
- `<story>/personas/user.md` or `.txt` — the player character.
- `<story>/locations/<name>.md` or `.txt`, `<story>/plots/<name>.md` or `.txt` — optional context.
- `<story>/sessions/` — saved histories; each story keeps its own sessions.
- `<story>/history/` — AI-generated story summaries, separate from full sessions.

Without `--story`, the app lists story folders and defaults to `sample_1`.
`dist`, `node_modules`, `src`, and `tests` are excluded. You can also select a
folder directly with `--story <folder>` or `STORY_DIR`.

The defaults are narrator mode, no character, `personas/user.md`, and
`plots/plot.md`. In an interactive terminal, the app asks you to choose a
location from the selected story's `locations/` folder. `--location <name>`
skips that prompt. For example:

```bash
npm run dev -- --story shibuya_end_fight --location shibuya
```

Stories and their saved sessions remain separate; switching folders does not
clear another story's files or history. Add a folder for a new story, and add
`.md` or `.txt` files under its content folders. Both extensions are accepted;
when both exist for the same name, `.md` is preferred. DOCX files are not
supported yet.

After selection, the chooser is cleared and the selected story name is shown.
If the selected plot file is available, the narrator generates an opening
scene before the first player prompt. Resuming a session does not generate a
new opening.

## Startup

At startup, choose **New Chat** or one of the story's saved history summaries.
New Chat begins from the plot; choosing a summary adds it to the narrator's
context before generating the opening scene. If no summaries exist, the menu
offers `New Chat (No History Found)`.

## Commands

* `/exit` save & quit · 
* `/save` save session and story summary · 
* `/load` list/load a session · 
* `/history` save/load a compact story summary ·
* `/info` show the selected story's files · 
* `/reload` re-read content files · 
* `/help` list commands

Session saves use `sessions/session1.json`, `session2.json`, and so on.


`/load` lists the current story's session files; select by number or filename.
Existing renamed `.json` files are listed as-is and are not renamed.

`/history` offers **Save history** (ask the model to summarize the story into
`history/history1.json`, etc.) or **Load history** (print and use a saved
summary as ongoing context, clearing the loaded transcript from active memory).


`/save` saves both a session and a history summary. `/info` shows the selected
persona, location, and plot, all character files, and available session/history
files.

Each history JSON records the story folder, the relative path of its source
session (for example `../sessions/session7.json`), the selected location file,
model, and summary text.

## Modes

- `--mode narrator` (default): the model narrates and voices all NPCs.
- `--mode character`: the model is one character.
- Narrator replies can contain multiple characters.

In narrator mode, the app adds a character roster from `characters/`, then
loads full `.md`/`.txt` details only for characters named in the current
message, recent conversation, plot, location, or loaded history. Explicit `--character` use always loads that
character. This keeps the character folder available without adding every
character file to every prompt.

The terminal input uses Enter to submit and Shift+Enter to insert a newline
for terminals that support terminal-enhanced Shift+Enter key sequences. Older
Windows or terminal configurations may not expose the Shift modifier to Node;
in that case, end the current line with `\` and press Enter to insert a newline.

## Tests

```bash
npm test    # unit tests for config, content loading, prompts, and history
```

## folder

```
journeyAI/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── Agent.md
├── README.md
├── LICENSE
├── src/
│   ├── index.ts      # entry, REPL loop, history array, save/load on exit
│   ├── config.ts     # read env (BASE_URL, MODEL, API_KEY)
│   ├── loaders.ts    # load {character,persona,location,plot}.md/.txt → string | null
│   ├── prompt.ts     # buildSystemPrompt(...) — pure function, no I/O
│   └── chat.ts       # streaming fetch to /chat/completions
├── <story>/          # e.g. sample_1/, shibuya_end_fight/
│   ├── characters/   # one file per character
│   ├── personas/     # the player/MC
│   ├── locations/    # optional
│   ├── history/      # optional
│   ├── plots/        # optional
│   └── sessions/     # saved histories for this story
```

Five source files. If you feel the need to add a sixth, stop and re-read 