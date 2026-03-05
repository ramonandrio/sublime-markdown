# CompassAI

An AI copilot for Product Managers, built for Claude Code.

Most PMs use AI like Google: one-off questions, zero context. This works differently. You give it your company context once, and every output — PRDs, meeting notes, status updates, strategy docs — sounds like it came from someone who actually works there.

---

## What you get

- **41 slash commands** covering the full PM loop: strategy, research, PRDs, metrics, meetings, launches
- **Context system** that keeps Claude informed about your company, product, and team
- **Sub-agent reviewers** to pressure-test your work from engineering, design, exec, and legal perspectives
- **MCP integrations** to query your analytics, project management, and research tools by asking naturally

---

## Quick start

**1. Install Claude Code**

```bash
npm install -g @anthropic-ai/claude-code
```

Requires [Claude Pro](https://claude.ai) ($20/mo) or an [Anthropic API key](https://console.anthropic.com).

**2. Open this folder**

```bash
cd compassai
claude
```

**3. Follow `START-HERE.md`**

Fill in 3 short context files, then run your first command.

---

## Folder structure

```
context/          ← Your company, product, and team context
projects/          ← All generated work (PRDs, notes, updates, analyses)
sub-agents/       ← Specialist reviewers
resources/         ← Advanced frameworks and guides
.claude/skills/   ← 41 slash commands
```

---

## Most-used commands

```
/daily-plan         Start your day with a prioritized plan
/prd-draft          Draft a PRD with your company context
/meeting-notes      Turn a transcript into structured notes + action items
/weekly-plan        Set this week's priorities
/prd-review-panel   Get 7 perspectives on your PRD
/connect-mcps       Connect your analytics and PM tools
```

Type `/` in Claude Code to see all 41 commands.
