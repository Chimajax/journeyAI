// loaders.ts — read .md/.txt content files. The loader returns raw text.
// No parsing, no schema. The model reads it (§4).
// Missing files return null; callers warn and continue (fail soft, §5).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
export async function listFiles(directory, extensions) {
    try {
        const entries = await readdir(directory, { withFileTypes: true });
        const allowed = new Set(extensions.map((extension) => extension.toLowerCase()));
        return entries
            .filter((entry) => entry.isFile() && allowed.has(path.extname(entry.name).toLowerCase()))
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }
    catch (err) {
        if (err?.code === 'ENOENT')
            return [];
        throw err;
    }
}
export function nextNumberedJsonName(files, prefix) {
    const existing = new Set(files.map((file) => file.toLowerCase()));
    let number = files.length + 1;
    while (existing.has(`${prefix}${number}.json`.toLowerCase()))
        number += 1;
    return `${prefix}${number}.json`;
}
// The display name of a content file is its filename stem, capitalized
// (§12: characters are free-form markdown, so there is nothing else to parse).
export function displayName(stem) {
    if (!stem)
        return null;
    const name = stem.replace(/\.(?:md|txt)$/i, '');
    return name.charAt(0).toUpperCase() + name.slice(1);
}
const EXCLUDED_STORY_FOLDERS = new Set(['dist', 'node_modules', 'src', 'tests']);
export async function listStoryFolders(rootDir) {
    const entries = await readdir(rootDir, { withFileTypes: true });
    return entries
        .filter((entry) => (entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !EXCLUDED_STORY_FOLDERS.has(entry.name.toLowerCase())))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
}
export async function listLocations(storyDir) {
    try {
        const entries = await readdir(path.join(storyDir, 'locations'), { withFileTypes: true });
        const choices = new Map();
        for (const entry of entries) {
            if (!entry.isFile())
                continue;
            const extension = path.extname(entry.name).toLowerCase();
            if (extension !== '.md' && extension !== '.txt')
                continue;
            const stem = path.basename(entry.name, path.extname(entry.name));
            const key = stem.toLowerCase();
            const current = choices.get(key) ?? { stem, extensions: new Set() };
            current.extensions.add(extension);
            choices.set(key, current);
        }
        return [...choices.values()]
            .map(({ stem, extensions }) => ({
            stem,
            preferredFile: `${stem}${extensions.has('.md') ? '.md' : '.txt'}`,
            extensions: [...extensions].sort((a, b) => (a === '.md' ? -1 : b === '.md' ? 1 : 0)),
        }))
            .sort((a, b) => a.stem.localeCompare(b.stem));
    }
    catch (err) {
        if (err?.code === 'ENOENT')
            return [];
        throw err;
    }
}
async function loadText(directory, name) {
    if (!name)
        return null;
    const requestedExtension = path.extname(name).toLowerCase();
    const stem = requestedExtension === '.md' || requestedExtension === '.txt'
        ? name.slice(0, -path.extname(name).length)
        : name;
    const extensions = requestedExtension === '.md' || requestedExtension === '.txt'
        ? [requestedExtension, requestedExtension === '.md' ? '.txt' : '.md']
        : ['.md', '.txt'];
    for (const extension of extensions) {
        const file = path.join(directory, `${stem}${extension}`);
        try {
            return await readFile(file, 'utf8');
        }
        catch (err) {
            if (err?.code !== 'ENOENT')
                throw err;
        }
    }
    console.error(`[journeyai] warning: ${path.basename(directory)}/${stem}.md or ${stem}.txt not found — continuing without it`);
    return null;
}
// Re-reads every referenced content file fresh. Called at startup and on /reload
// (§5: edits to aria.md must take effect on resume/restart).
export async function loadContent(cfg) {
    const [character, persona, location, plot] = await Promise.all([
        loadText(path.join(cfg.storyDir, 'characters'), cfg.character),
        loadText(path.join(cfg.storyDir, 'personas'), cfg.persona),
        loadText(path.join(cfg.storyDir, 'locations'), cfg.location),
        loadText(path.join(cfg.storyDir, 'plots'), cfg.plot),
    ]);
    return { character, persona, location, plot };
}
