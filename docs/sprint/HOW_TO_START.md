# How to start — step by step

Plain instructions. Follow them in order. Ask in the group chat if anything here does not match
what you see on screen.

---

## Before anything: who is which machine?

Agree on this in the group chat first. One person per letter.

| Machine | Person | What you build |
|---|---|---|
| A | | Loading hospital data files |
| B | | The rules that decide what to show |
| C | | The pop-up box that shows the advice |
| D | | The chat and the phone contacts |
| E | | Testing, and putting everyone's work together |

---

## Step 1 — Get access (the repo owner does this once)

The repo owner opens
`https://github.com/hsa70-ui/sevaro-encounter-guide` → **Settings** → **Collaborators** →
**Add people** → adds the other four by GitHub username.

Everyone else: check your email and accept the invite. **Nobody can push code until this is done.**

---

## Step 2 — Get the code on your laptop

Open a terminal (PowerShell on Windows, Terminal on Mac) and run these one at a time:

```bash
git clone https://github.com/hsa70-ui/sevaro-encounter-guide.git
cd sevaro-encounter-guide
git checkout sprint/demo
corepack enable
pnpm install --frozen-lockfile
pnpm test
```

The last command should end with **110 passed**. If it does not, say so in the group chat before
you change anything — something is wrong with your setup, not with the code.

Then start the app so you can see it:

```bash
pnpm dev
```

Open `http://127.0.0.1:5173` in your browser. Leave this terminal running; open a second terminal
for everything else.

---

## Step 3 — Read two short things

1. `docs/sprint/SPRINT_PLAN.md` — the day's plan. Pay attention to the table of **who owns which
   files**. This is what stops five people breaking each other's work.
2. `docs/sources/Challenge_1_Handbook.pdf` — what the sponsor actually asked for. If anything in
   our instructions contradicts this PDF, **the PDF wins**.

---

## Step 4 — Open Claude Code in the project folder

"Claude Code" is the AI assistant you run in your terminal or inside VS Code.

**In VS Code:** File → Open Folder → pick `sevaro-encounter-guide` → open the Claude Code panel.

**In a terminal:** make sure you are inside the `sevaro-encounter-guide` folder, then run:

```bash
claude
```

Being inside the project folder matters. If you start Claude somewhere else, it cannot see the
code.

---

## Step 5 — Tell Claude what you are building

Your instructions are already in the repo. You do **not** need to copy and paste anything long.

Type this as your first message, changing the letter to your machine:

> Read `docs/sprint/MACHINE_A_INGESTION.md` and follow it. Start with the first task.

The five files are:

| Machine | Type this filename |
|---|---|
| A | `docs/sprint/MACHINE_A_INGESTION.md` |
| B | `docs/sprint/MACHINE_B_ENGINE.md` |
| C | `docs/sprint/MACHINE_C_DOCK.md` |
| D | `docs/sprint/MACHINE_D_CHAT.md` |
| E | `docs/sprint/MACHINE_E_GUARDRAILS.md` |

Claude will read the file, read the sponsor's PDF and the existing code, and start working. Your
file tells it which files you own, which files you must not touch, what to build, and how to check
its own work.

**You are not just watching.** Read what it changes, run the tests yourself, and push back when
something looks wrong. You are responsible for the code with your name on it.

---

## Step 6 — The first 35 minutes: B and C go first, alone

This is the only part where order matters. **A, D and E must wait.**

Machines B and C are about to change files that everyone else builds on top of. If you all start
at once, you will overwrite each other.

**Machine B (about 15 minutes):** tell Claude:

> Do Kickoff 1 from `docs/sprint/SPRINT_PLAN.md` section 5 only. Commit it straight to the
> `sprint/demo` branch and push. Do not start anything else yet.

When it is pushed, say **"Kickoff 1 is pushed"** in the group chat.

**Machine C (about 20 minutes, can start at the same time as B):** tell Claude:

> Do Kickoff 2 from `docs/sprint/SPRINT_PLAN.md` section 5 only — the empty placeholder files and
> the folder structure. Commit straight to `sprint/demo` and push. Do not start anything else yet.

When it is pushed, say **"Kickoff 2 is pushed"** in the group chat.

**Everyone else:** while you wait, read your own machine's file and the handbook PDF. Do not write
code yet.

---

## Step 7 — Everyone starts properly

Once both kickoff messages appear in the chat, **everyone** runs:

```bash
git checkout sprint/demo
git pull
git checkout -b sprint/a-ingestion     # use your own letter and name
```

Branch names:

| Machine | Branch name |
|---|---|
| A | `sprint/a-ingestion` |
| B | `sprint/b-engine` |
| C | `sprint/c-dock` |
| D | `sprint/d-chat` |
| E | `sprint/e-guardrails` |

Now tell Claude to carry on with your tasks.

---

## Step 8 — Your working rhythm (repeat all day)

Roughly every 20–30 minutes:

```bash
pnpm typecheck        # no errors
pnpm test             # still 110+ passing
git add -A
git commit -m "short description of what you did"
git push -u origin sprint/a-ingestion     # your branch; after the first time, just: git push
```

**Never push if the tests are failing.** Fix it or ask for help first.

Small, frequent commits. If something goes badly wrong, you lose 20 minutes of work, not the whole
day.

---

## Step 9 — Three times today, Machine E puts it all together

At **1pm, 5:30pm and 8pm**, stop and check in.

**Everyone:** push your work, then go to GitHub and open a Pull Request from your branch into
`sprint/demo`. Post the link in the chat.

**Machine E:** merge them in order A, B, C, D, then run everything and report what broke.

**After E posts the result, everyone runs:**

```bash
git fetch
git rebase origin/sprint/demo
```

That pulls everyone else's work into your branch so you are building on the latest version.

If the rebase reports a conflict, do not guess — tell Claude:

> I have a git conflict after rebasing. Show me what the conflict is and help me resolve it.

---

## Step 10 — 5:30pm is the important one

Machine E has built two fake hospitals that **nobody else has seen**, written to be awkward on
purpose — exactly like the files the judges will hand us tomorrow.

At 5:30pm E loads them into the app live, in front of everyone, and we see what breaks.

Whatever breaks is the **only** thing anyone works on afterwards. Not new features. Fixes.

---

## Step 11 — 8pm: stop adding things

No new features after 8pm. Only fixing what is broken.

E deploys the final version and the whole team practises the demo script
(`docs/sprint/SPRINT_PLAN.md` section 9) **twice**, out loud, with the laptop that will be used
tomorrow. E also records a screen video as a backup in case the live demo misbehaves.

---

## The rules nobody breaks

1. **Only edit files your machine owns.** The table is in `SPRINT_PLAN.md` section 4. If you need
   something changed in someone else's file, ask them in the chat — do not edit it yourself.
2. **Tests must pass before you push.**
3. **The handbook PDF wins** any argument about what the product should do.
4. **Everything is made up** — fake hospitals, fake phone numbers (555-01xx), no real patient or
   hospital information anywhere.

---

## If you get stuck

Say so in the group chat early. An hour lost quietly is an hour we do not get back before the
demo. There is no prize for struggling alone.
