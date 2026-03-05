# How CompassAI Works

A guide to understanding, using, and customizing your AI copilot.

---

## The big picture

CompassAI turns Claude Code into a PM copilot that knows your company, your product, and your team. The more context you give it, the better it works.

Most AI tools start from scratch every conversation. This one doesn't. It has a persistent memory, a structured workspace, and 43 commands built for PM work. You talk to it like a colleague who's been here since day one.

---

## Two core concepts: Soul and Memory

**Soul (`CLAUDE.md`)**

This file defines who the copilot is. Its role, how it writes, how it interacts, what it prioritizes. It's the same in every session, for every PM who uses CompassAI.

You can read it, but don't edit it mid-use. Small edits accumulate into drift — the copilot gradually becomes something different from what you intended. If you want to change how it behaves, do it deliberately, in one sitting, with a clear intent. That's the Drift Guard rule.

**Memory (auto-memory)**

This is what the copilot learns about you specifically. It lives in Claude Code's auto-memory directory and gets loaded into every session automatically. It starts mostly empty and fills in as you work — after `/setup`, after you correct a style choice, after a stakeholder relationship evolves.

The memory has a Drift Guard too: within a single session, you can add entries but not rewrite existing ones. Corrections go in as new dated entries. This prevents a bad day from permanently warping what the copilot thinks it knows.

---

## File structure

```
compassai/
│
├── CLAUDE.md              ← Soul. Who the copilot is. Don't edit casually.
├── START-HERE.md          ← Setup guide for new PMs
├── README.md              ← One-page overview
│
├── context/               ← What you fill in once and update over time
│   ├── MY-PROFILE.md      ← Your background, role, working style
│   ├── MY-COMPANY.md      ← Company, stage, competitors, priorities
│   ├── MY-TEAM.md         ← Team and stakeholder map
│   ├── meetings.md        ← Running log of meeting notes
│   ├── products/          ← One file per product you work on
│   ├── strategy-docs/     ← Roadmaps, OKRs, strategy docs
│   └── roadmaps/          ← Product roadmaps
│
├── projects/              ← All active work lives here
│   ├── [PRD][Producto]Nombre.md              ← The PRD
│   ├── [Recursos][Producto]Nombre/           ← Supporting files
│   │   ├── research.md
│   │   ├── launch.md
│   │   ├── learnings.md
│   │   ├── meetings.md
│   │   └── prototypes/
│   └── ops/               ← Cross-cutting operational outputs
│       ├── weekly-plans/
│       ├── weekly-reviews/
│       ├── status-updates/
│       └── slack-messages/
│
├── sub-agents/            ← Specialist reviewers
├── resources/             ← Reference material (you're here)
└── .claude/
    ├── skills/            ← 43 slash commands
    └── settings.json      ← Claude Code configuration
```

### Naming convention for projects

Every initiative has two things:
- A PRD file: `[PRD][Producto]Nombre de la iniciativa.md`
- A resources folder: `[Recursos][Producto]Nombre de la iniciativa/`

The folder name mirrors the PRD name exactly. This makes it easy to find everything related to an initiative in one place.

---

## How skills work

Skills are slash commands — pre-built workflows for common PM tasks. They live in `.claude/skills/` and register automatically in Claude Code.

**To use a skill:**
```
/prd-draft
/meeting-notes
/weekly-plan
```

Type `/` to see the full autocomplete list.

**What happens when you run a skill:**
1. Claude Code loads the skill file from `.claude/skills/[name]/SKILL.md`
2. Claude reads the skill instructions alongside your context files
3. It follows the workflow defined in the skill, adapting it to your company and product

Skills are context-aware. `/prd-draft` knows your company's priorities. `/meeting-notes` knows your stakeholders. The more you fill in `context/`, the more specific and useful the outputs.

**You don't need to memorize skill names.** Just describe what you need — "I want to draft a PRD for X" — and Claude will suggest or invoke the right skill.

---

## How sub-agents work

Sub-agents are specialist personas that review your work from a specific perspective. They live in `sub-agents/`.

**To use a sub-agent:**
```
Review this PRD from an engineering perspective.
Give me the executive take on this proposal.
Review this from a legal standpoint.
```

Claude reads the sub-agent file and adopts that mindset. You can ask for multiple perspectives in one request:
```
Review this PRD as an engineer, a designer, and a skeptic.
```

For a full 7-perspective review, use the skill:
```
/prd-review-panel
```

Sub-agents don't need any setup. They work out of the box, and they get more useful as you fill in stakeholder context in `context/MY-TEAM.md` — because then the "executive reviewer" can reference your actual CPO's known priorities.

---

## Customizing the system

CompassAI is designed to be adapted. Here's how to change it at different levels.

### Level 1 — Change context (5 minutes)

The easiest customization. Edit any file in `context/` to reflect your reality:
- Update `MY-COMPANY.md` when priorities shift
- Add a new file in `context/products/` when you take on a new product
- Add people to `MY-TEAM.md` as your stakeholder map grows

Claude picks up all changes automatically in the next session.

### Level 2 — Change the soul (30 minutes, do carefully)

Edit `CLAUDE.md` to change how the copilot behaves fundamentally:
- Add a new writing rule ("always include a confidence level on estimates")
- Change how it handles a specific workflow ("when processing meeting notes, always check if the PRD needs updating")
- Adjust its personality ("be more direct, shorter answers by default")

Do this in one sitting with clear intent. Don't tweak CLAUDE.md incrementally — that's how drift happens.

### Level 3 — Create a new skill (1-2 hours)

If you repeatedly do a workflow that no skill covers, build one.

**Structure:**
```
.claude/skills/
└── your-skill-name/
    └── SKILL.md
```

**SKILL.md format:**
```markdown
---
name: your-skill-name
description: One line describing what this skill does
user-invocable: true
---

## Purpose
What this skill does and when to use it.

## Usage
/your-skill-name → [what it produces]
/your-skill-name [variant] → [what that produces]

## Flow

### Step 1 — [Step name]
[What Claude does in this step]

### Step 2 — [Step name]
[What Claude does in this step]

## Output
[What file gets created, where it's saved, what format]
```

**Tips for writing good skills:**
- Start with what the PM provides and what they get back
- Reference context files by path so the skill is context-aware
- Include a fallback for when context is missing ("if MY-COMPANY.md isn't filled in, ask...")
- Save outputs to `projects/` following the naming convention
- Look at an existing skill like `meeting-notes` or `prd-draft` for reference

Once saved, the skill registers automatically. Restart Claude Code and type `/your-skill-name`.

### Level 4 — Create a new sub-agent (30 minutes)

If you need a perspective that doesn't exist yet (a data analyst, a compliance officer, a customer success rep), create a sub-agent.

**Structure:**
```
sub-agents/
└── your-agent-name.md
```

**Agent file format:**
```markdown
# [Role] Sub-Agent

Brief description of this agent's perspective.

## Your Role
Who you are, what you care about, what your priorities are.
Write in second person ("You are...").

## Review Framework

### 1. [Area of focus]
What questions you ask in this area.
What good looks like, what bad looks like.

### 2. [Area of focus]
...

## How to give feedback
Tone, format, what to lead with.
```

**Tips:**
- Make the role specific. "Senior data analyst at a B2B SaaS company with 5 years of PM collaboration experience" is more useful than "data person."
- Define what they care about and what makes them push back.
- Look at `sub-agents/skeptic.md` or `sub-agents/engineer-reviewer.md` for reference.

To use it: "Review this from a data analyst perspective." Claude will read the file and adopt that mindset.

### Level 5 — Change the folder structure

If the current structure doesn't fit how you think, change it. The system has no hard dependencies — it's just files and folders plus CLAUDE.md telling Claude where things live.

**Steps:**
1. Move or rename the folders you want to change
2. Update `CLAUDE.md` to reflect the new paths (the "File structure" section)
3. Update the skills that reference the old paths (search for the old path in `.claude/skills/`)
4. Update `resources/how-it-works.md` so future-you remembers the change

The only file that must stay in place is `CLAUDE.md` at the root, because Claude Code reads it automatically.

---

## Tips for getting the most out of CompassAI

**Fill in context early.** The first 20 minutes you spend on `/setup` and the context files compounds into hours saved. Every skill output improves when Claude knows your company.

**Talk naturally.** You don't need to use slash commands. "Help me think through the tradeoffs on this decision" works just as well as `/decision-doc`. Use commands when you want the full structured workflow, natural language when you're exploring.

**Correct the copilot.** When an output is off — wrong tone, wrong length, wrong framing — say so specifically. Claude will adjust immediately and (if the pattern repeats) update its memory so it doesn't happen again.

**Use Plan Mode for complex tasks.** Press `Shift+Tab` before Claude starts working on anything multi-step. Review the plan before it executes. This saves a lot of back-and-forth.

**Keep context fresh.** When strategy changes, update `MY-COMPANY.md`. When a stakeholder changes roles, update `MY-TEAM.md`. Stale context produces stale outputs.
