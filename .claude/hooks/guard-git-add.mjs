#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Enforces CLAUDE.md "stage explicit paths only".
// Input: hook JSON on stdin (tool_input.command). Exit 2 + stderr = block; exit 0 = no opinion.
//
// Blocks `git add` that (a) uses -A / --all / -u / --update / "." or (b) names a .env file
// (.env.example is allowed) or a .docx file.
//
// Known limits. This is a guardrail, not a security boundary. It does NOT catch:
//   - `git commit -a` / `-am` and `git add -p`, which bypass the explicit-paths rule (not blocked);
//   - variable expansion, aliases, `bash -c '...'`, globs such as `git add *` or `.env*`;
//   - other spellings of "everything": `..`, `./.`, `$PWD`, absolute repo path, `:/`,
//     `--pathspec-from-file`, or a directory path (its contents are not inspected);
//   - unbalanced quotes / heredocs can hide or fake a command; unknown wrappers before `git`.
// It fails open on any error (bad input, parser bug, missing node/script).
import { readFileSync, realpathSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const SEPARATORS = new Set([";", "&", "|", "\n", "(", ")", "`"]);

/** Split a shell command into segments of words. Quotes are honoured; separators inside them are not. */
export function parseSegments(command) {
  const segments = [];
  let words = [];
  let word = null;
  let quote = null;
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endSegment = () => {
    endWord();
    if (words.length > 0) segments.push(words);
    words = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      word ??= "";
    } else if (c === "\\" && i + 1 < command.length) {
      word = (word ?? "") + command[++i];
    } else if (SEPARATORS.has(c)) {
      endSegment();
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      word = (word ?? "") + c;
    }
  }
  endSegment();
  return segments;
}

// Words that may precede `git` in a segment (wrappers and shell keywords).
const PREFIX_WORDS = new Set(["env", "command", "sudo", "time", "nohup", "exec", "xargs"]);
for (const w of ["then", "do", "else", "elif", "if", "while", "until", "{", "!"])
  PREFIX_WORDS.add(w);

const GLOBAL_OPTS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);

/** Returns the args after `add` when the segment is `git [opts] add ...`, else null. */
function gitAddArgs(words) {
  let i = 0;
  while (i < words.length && (/^\w+=/.test(words[i]) || PREFIX_WORDS.has(words[i]))) i++;
  if (basename(words[i] ?? "") !== "git") return null;
  i++;
  while (i < words.length && words[i].startsWith("-")) {
    i += GLOBAL_OPTS_WITH_VALUE.has(words[i]) ? 2 : 1;
  }
  return words[i] === "add" || words[i] === "stage" ? words.slice(i + 1) : null;
}

function isForbiddenFile(path) {
  const name = basename(path);
  if (name === ".env.example") return false;
  return name.startsWith(".env") || name.toLowerCase().endsWith(".docx");
}

/** Returns a reason string if the command must be blocked, else null. */
export function checkCommand(command) {
  for (const words of parseSegments(command)) {
    const args = gitAddArgs(words);
    if (!args) continue;
    let pathsOnly = false;
    for (const arg of args) {
      if (!pathsOnly && arg === "--") {
        pathsOnly = true;
      } else if (!pathsOnly && arg.startsWith("-")) {
        if (arg === "--all" || arg === "--update" || /^-[a-zA-Z]*[Au]/.test(arg)) {
          return `"git add ${arg}" stages everything that changed.`;
        }
      } else if (arg === "." || arg === "./") {
        return `"git add ${arg}" stages the whole directory.`;
      } else if (isForbiddenFile(arg)) {
        return `"${arg}" is an environment file or .docx and must never be staged.`;
      }
    }
  }
  return null;
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0; // unreadable input: fail open, never wedge the session
  }
  const command = input?.tool_input?.command;
  if (input?.tool_name !== "Bash" || typeof command !== "string") return 0;
  let reason;
  try {
    reason = checkCommand(command);
  } catch {
    return 0; // parser bug: fail open
  }
  if (!reason) return 0;
  process.stderr.write(
    `Blocked by .claude/hooks/guard-git-add.mjs: ${reason} ` +
      "CLAUDE.md rule: stage explicit paths only (git add <file> ...); never stage .env or .docx files.\n",
  );
  return 2;
}

// Compare real paths: a symlinked checkout makes argv[1] differ from import.meta.url.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) process.exit(main());
