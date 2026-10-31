import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./guard-git-add.mjs", import.meta.url));

function run(stdin) {
  return spawnSync(process.execPath, [script], { input: stdin, encoding: "utf8" });
}

function runCommand(command) {
  return run(JSON.stringify({ tool_name: "Bash", tool_input: { command } }));
}

const blocked = [
  "git add -A",
  "git add --all",
  "git add .",
  "git add ./",
  "git add -u",
  "git add --update",
  "git add -Av",
  "git add .env",
  "git add apps/api/.env",
  "git add .env.local",
  "git add a.docx",
  "git add docs/requirements/SRS.DOCX",
  "git add docs/x.md && git add .",
  "git add docs/x.md; git add -A",
  "git -C . add .",
  "cd x && git add -A",
  "git add -f .env",
  "git add -- .",
  "echo $(git add .)",
  "git stage .",
  "env git add -A",
  "sudo git add .",
  "if true; then git add .; fi",
  "git add .envrc",
];

const allowed = [
  "git add docs/x.md",
  "git add .env.example",
  "git add apps/api/.env.example",
  "git add a.md b.ts",
  "git add -- docs/x.md",
  "git add -n docs/x.md",
  "git status",
  "git diff --cached",
  'git commit -m "feat(i0X): x"',
  'git commit -m "do not git add . or -A"',
  "echo hi",
  "ls .",
];

for (const command of blocked) {
  test(`blocks: ${command}`, () => {
    const result = run(JSON.stringify({ tool_name: "Bash", tool_input: { command } }));
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Blocked by .*guard-git-add/);
  });
}

for (const command of allowed) {
  test(`allows: ${command}`, () => {
    const result = runCommand(command);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  });
}

test("still blocks when the script is run through a symlink", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-"));
  try {
    const link = join(dir, "guard.mjs");
    symlinkSync(script, link);
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git add ." } });
    const result = spawnSync(process.execPath, [link], { input, encoding: "utf8" });
    assert.equal(result.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails open on bad input", () => {
  for (const stdin of [
    "",
    "not json",
    "{}",
    JSON.stringify({ tool_name: "Bash", tool_input: {} }),
    JSON.stringify({ tool_name: "Write", tool_input: { command: "git add ." } }),
  ]) {
    const result = run(stdin);
    assert.equal(result.status, 0, `stdin: ${stdin}`);
    assert.equal(result.stderr, "");
  }
});
