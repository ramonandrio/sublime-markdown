# Start Here

You're 15 minutes away from having an AI copilot that knows your company, your product, and your team.

---

## Step 1: Install Claude Code

You'll need a [Claude Pro](https://claude.ai) subscription ($20/mo) or an [Anthropic API key](https://console.anthropic.com).

```bash
npm install -g @anthropic-ai/claude-code
```

Verify it works:

```bash
claude --version
```

---

## Step 2: Launch Claude Code

Click **Arrancar Claude** in the terminal panel, or type:

```bash
claude
```

You're already in the right folder. Claude Code will read `CLAUDE.md` automatically and know how to work with you.

---

## Step 3: Run setup

On first launch, Claude will detect that your context is empty and suggest running `/setup`. Do it.

```
/setup
```

Setup walks you through 5 steps in about 10-15 minutes:

1. **Your profile** — share your LinkedIn PDF or describe your background
2. **Your company** — Claude searches public info and you can add docs or comments
3. **Your team** — upload an org chart screenshot or just tell Claude who's who
4. **Your products** — upload any docs you have, or describe what you build
5. **Start something** — Claude offers to kick off your first initiative

After setup, Claude writes everything to your context files and memory automatically.

> **Skip it if you want.** Everything works without setup — just with less personalization. You can always run `/setup` later or fill in `context/` manually.

---

## Step 4: Start working

```
/daily-plan       → Prioritized plan for today
/prd-draft        → Draft a PRD with your company context
/meeting-notes    → Paste a transcript, get structured notes + action items
/weekly-plan      → Set this week's priorities
/deep-research    → Build a deep research prompt through conversation
```

Or just talk naturally — "help me think through this feature" works too.

---

## What's in this folder

```
context/          ← Your company, products, team, and meeting notes
projects/         ← All work Claude creates goes here
sub-agents/       ← Specialist reviewers (engineer, designer, exec, legal...)
resources/        ← Skills reference, sub-agents guide, frameworks, how-it-works
.claude/skills/   ← 44 slash commands
```

---

## 5 things to know

1. **Talk naturally.** You don't need slash commands. Describe what you need and Claude figures it out.
2. **Context compounds.** The more you fill in, the sharper every output gets. Invest 15 minutes in setup.
3. **Everything goes in `projects/`.** PRDs, meeting notes, weekly plans — Claude organizes them automatically.
4. **Use Plan Mode for complex tasks.** Press `Shift+Tab` before Claude starts. Review the plan before it runs.
5. **Clear when switching topics.** Type `clear` to start fresh for a new initiative.

---

## Where to go next

- `resources/how-it-works.md` — understand the system, customize it, build your own skills
- `resources/skills-reference.md` — full list of 44 slash commands
- `resources/advanced/sub-agents-reference.md` — the 7 specialist reviewers and when to use them
- `resources/advanced/connecting-tools.md` — connect analytics, project management, and research tools
