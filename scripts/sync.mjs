#!/usr/bin/env node
// Pull in what the other machines have shipped, without publishing anything.
//
//   node scripts/sync.mjs
//
// Run it before you start a task. Starting on top of work that is an hour old
// is how two people end up solving the same problem differently.

import { execSync, spawnSync } from "node:child_process";

const TEAM = "sprint/demo";
const out = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const sh = (cmd) => execSync(cmd, { stdio: "inherit" });

const branch = out("git rev-parse --abbrev-ref HEAD");
execSync("git fetch origin --quiet");

if (branch === TEAM) {
  sh("git pull --ff-only");
  console.log(`\n✓ ${TEAM} is up to date.\n`);
  process.exit(0);
}

const incoming = out(`git log HEAD..origin/${TEAM} --oneline`);
if (!incoming) {
  console.log(`\n✓ Nothing new on ${TEAM}. Carry on.\n`);
  process.exit(0);
}

console.log(`\nNew from the team:\n${incoming.split("\n").map((l) => `  ${l}`).join("\n")}\n`);

if (out("git status --porcelain")) {
  console.error(
    "✗ You have uncommitted changes. Commit them first, or stash:\n" +
      "    git stash   …then after this: git stash pop\n",
  );
  process.exit(1);
}

const r = spawnSync("git", ["rebase", `origin/${TEAM}`], { stdio: "inherit" });
if (r.status !== 0) {
  console.error(
    "\n✗ Your work and theirs overlap, so git stopped mid-rebase.\n" +
      '  Open Claude Code and say: "I have a rebase conflict. Show me both sides and help me resolve it."\n' +
      "  To abandon and go back: git rebase --abort\n",
  );
  process.exit(1);
}

const t = spawnSync("npx", ["vitest", "run", "--silent"], { stdio: "inherit", shell: true });
if (t.status !== 0) {
  console.error(
    "\n✗ Tests fail now that their work is in. Say so in the group chat before you keep going —\n" +
      "  whoever shipped last needs to know.\n",
  );
  process.exit(1);
}

console.log("\n✓ Up to date, tests pass. Start your task.\n");
