#!/usr/bin/env node
// Ship one finished task: verify it, bring in everyone else's work, verify
// again, then publish it to the team branch.
//
//   node scripts/ship.mjs "short description of what you did"
//
// Nothing reaches sprint/demo unless the tests pass both before and after the
// rebase. The second run is the one that matters: your work passing alone says
// nothing about whether it still passes alongside the other two machines'.

import { execSync, spawnSync } from "node:child_process";

const TEAM = "sprint/demo";
const message = process.argv.slice(2).join(" ").trim();

const sh = (cmd, quiet = false) =>
  execSync(cmd, { stdio: quiet ? "pipe" : "inherit", encoding: "utf8" });
const out = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const die = (...lines) => {
  console.error(`\n✗ ${lines.join("\n  ")}\n`);
  process.exit(1);
};
const step = (n, text) => console.log(`\n[${n}/6] ${text}`);

const branch = out("git rev-parse --abbrev-ref HEAD");
if (branch === TEAM)
  die(
    `You are on ${TEAM}, the shared branch.`,
    "Work on your own branch and let this script publish it:",
    "  git checkout -b sprint/<your-branch>",
  );
if (!message)
  die('Say what you did: node scripts/ship.mjs "storyboard import accepts the sponsor format"');

const dirty = out("git status --porcelain");
if (!dirty && out(`git log origin/${TEAM}..HEAD --oneline`) === "")
  die("Nothing to ship — no changes and nothing unpublished.");

step(1, "Checking your work");
const verify = () => {
  const r = spawnSync("npx", ["tsc", "--noEmit"], { stdio: "inherit", shell: true });
  if (r.status !== 0) return "typecheck";
  const t = spawnSync("npx", ["vitest", "run", "--silent"], { stdio: "inherit", shell: true });
  return t.status === 0 ? null : "tests";
};
let failed = verify();
if (failed) die(`Your ${failed} fail. Fix them before shipping — nothing was pushed.`);

if (dirty) {
  step(2, "Committing");
  sh("git add -A");
  sh(`git commit -q -m ${JSON.stringify(message)}`);
} else {
  step(2, "Already committed");
}

step(3, "Fetching the other machines' work");
sh("git fetch origin --quiet");
const behind = out(`git log HEAD..origin/${TEAM} --oneline`);
if (behind) {
  console.log(`  ${behind.split("\n").length} new commit(s) from the team:`);
  console.log(behind.split("\n").map((l) => `    ${l}`).join("\n"));
  const r = spawnSync("git", ["rebase", `origin/${TEAM}`], { stdio: "inherit" });
  if (r.status !== 0)
    die(
      "Your work and the team's overlap, so git stopped mid-rebase.",
      "Nothing was pushed. Open Claude Code and say:",
      '  "I have a rebase conflict. Show me both sides and help me resolve it."',
      "To abandon the rebase and go back: git rebase --abort",
    );
} else {
  console.log("  Already up to date.");
}

step(4, "Checking it still works alongside their changes");
failed = verify();
if (failed)
  die(
    `Your ${failed} fail after merging the team's work — the two changes disagree.`,
    "Nothing was pushed. Fix it, then run this again.",
    `Say in the group chat which files you touched, so whoever owns the other side knows.`,
  );

step(5, `Publishing ${branch}`);
sh(`git push -u origin ${branch} --force-with-lease`);

step(6, `Merging into ${TEAM}`);
sh(`git checkout ${TEAM} --quiet`);
sh("git pull --ff-only --quiet");
const merge = spawnSync("git", ["merge", "--no-ff", branch, "-m", `Merge ${branch}: ${message}`], {
  stdio: "inherit",
});
if (merge.status !== 0) {
  sh("git merge --abort");
  sh(`git checkout ${branch} --quiet`);
  die(`${TEAM} moved while this ran. Run the command again.`);
}
sh(`git push origin ${TEAM}`);
sh(`git checkout ${branch} --quiet`);

console.log(`\n✓ Shipped. ${TEAM} now has your work.`);
console.log("  Tell the group chat, so the others pull it before their next task.\n");
