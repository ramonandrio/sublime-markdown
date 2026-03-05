# Skills Reference

44 slash commands for the full PM workflow. Type `/` in Claude Code to see autocomplete.

---

## Most Used

| Skill | What it does |
|-------|-------------|
| `/meeting-notes` | Paste a transcript or raw notes → structured notes, decisions, and action items. |
| `/prd-draft` | Draft a PRD with your company context. Asks clarifying questions, follows modern format. |
| `/prototype` | Generate a working prototype from a PRD or description. |
| `/deep-research` | Guided conversation to build a deep research prompt. Generates it for any LLM tool, then ingests the results back into your context. |
| `/jira-summary` | 3-section summary of a PRD ready to paste into Jira. |

---

## Setup

| Skill | What it does |
|-------|-------------|
| `/setup` | First-time onboarding. Fills your context files (profile, company, team, products) step by step. Run this once. |
| `/connect-mcps` | Connect external tools (Amplitude, Linear, Notion, Dovetail...) so Claude can query them directly. |

---

## Daily & Weekly Rhythm

| Skill | What it does |
|-------|-------------|
| `/daily-plan` | Prioritized plan for today. Pulls from your PRDs, meetings, tasks, and connected tools. |
| `/weekly-plan` | Set this week's top priorities, tied to quarterly goals. |
| `/weekly-review` | End-of-week reflection. What shipped, what slipped, what you learned. |
| `/prioritize` | Classify your task list using the LNO framework (Leverage / Neutral / Overhead). |

---

## Meetings

| Skill | What it does |
|-------|-------------|
| `/meeting-notes` | Paste a transcript or raw notes → get structured notes, decisions, and action items. |
| `/meeting-agenda` | Create a structured agenda for an upcoming meeting. |
| `/meeting-cleanup` | Batch process multiple meetings from the same day. Deduplicates action items. |
| `/meeting-feedback` | Post-meeting reflection. Track patterns and improve over time. |

---

## Communication

| Skill | What it does |
|-------|-------------|
| `/status-update` | Generate a stakeholder update. Pulls from active PRDs, recent meetings, and metrics. |
| `/slack-message` | Draft a Slack message. Adapts tone to the audience and context. |
| `/decision-doc` | Document a decision: what we chose, why, what we considered, trade-offs. |

---

## Discovery & Research

| Skill | What it does |
|-------|-------------|
| `/user-interview` | Process a user interview transcript into insights, themes, and follow-up questions. |
| `/user-research-synthesis` | Synthesize multiple interviews into patterns, quotes, and recommendations. |
| `/interview-guide` | Create a JTBD-based interview guide for discovery research. |
| `/deep-research` | Guided conversation to define a research goal → generates a prompt for any deep research tool → ingests results back into your context. Suggests NotebookLM for podcast or slides. |
| `/competitor-analysis` | Deep competitive analysis or monthly tracking. Checks public sources and your research files. |
| `/journey-map` | Create a user journey map or customer journey map from research. |

---

## Strategy

| Skill | What it does |
|-------|-------------|
| `/write-prod-strategy` | Write a product strategy doc using a 7-component framework. |
| `/strategy-sprint` | Create a strategy in 1 day, 1 week, or 1 month. Progressive framework. |
| `/define-north-star` | Identify or validate your North Star Metric. |
| `/metrics-framework` | Build a leading/lagging indicator hierarchy tied to your North Star. |

---

## PRD & Scoping

| Skill | What it does |
|-------|-------------|
| `/prd-draft` | Draft a PRD. Asks clarifying questions, uses your company context, follows modern format. |
| `/prd-review-panel` | Multi-agent review of a PRD from 7 perspectives: engineering, design, exec, legal, UXR, skeptic, customer. |
| `/impact-sizing` | Quantify the value of a feature using driver trees and confidence levels. |
| `/jira-summary` | Generate a 3-section summary of a PRD ready to paste into Jira. |
| `/ralph-wiggum` | Devil's advocate review of any document. Finds gaps, bad assumptions, and missing data — with personality. |

---

## Metrics & Analysis

| Skill | What it does |
|-------|-------------|
| `/feature-metrics` | Define success metrics for a feature using the STEDII framework. |
| `/feature-results` | Post-launch analysis. Actual vs. expected impact. What we learned. |
| `/activation-analysis` | Diagnose your activation funnel using the Setup → Aha → Habit framework. |
| `/retention-analysis` | Cohort retention analysis. Identify drivers of churn and retention. |
| `/expansion-strategy` | Upsell and cross-sell tactics. Diagnose NRR and identify expansion levers. |
| `/experiment-decision` | Decide whether to A/B test or just ship. |
| `/experiment-metrics` | Choose trustworthy metrics for an experiment using STEDII. |

---

## Execution

| Skill | What it does |
|-------|-------------|
| `/create-tickets` | Break a PRD into engineering tickets. Creates them via MCP or generates formatted text. |
| `/launch-checklist` | Build a launch readiness checklist with owners, dependencies, and critical path. |

---

## Prototyping & Design

| Skill | What it does |
|-------|-------------|
| `/prototype` | Generate a working prototype from a PRD or description. Supports Artifacts, Figma, Lovable, v0, Bolt. |
| `/generate-ai-prototype` | Generate a prompt for AI prototyping tools (v0, Lovable, Bolt). |
| `/napkin-sketch` | ASCII wireframe of a UI concept. Fast and low-fidelity. |
| `/prototype-feedback` | Structured feedback on a prototype. Validates against PRD requirements and research. |

---

## Career & Interviews

| Skill | What it does |
|-------|-------------|
| `/interview-prep` | Prepare for a PM job interview. Product Sense, Execution, and Behavioral frameworks. |
| `/interview-feedback` | Post-interview debrief. What went well, what to improve. |

---

## Development

| Skill | What it does |
|-------|-------------|
| `/code-first-draft` | Initial implementation of a feature from PRD specs. Explores codebase, writes code with tests. |

---

## Tips

- **You don't need to memorize these.** Just describe what you need and Claude will suggest the right skill.
- **Skills use your context.** The more you fill in `context/`, the better the outputs.
- **Skills work without MCPs.** Connecting tools makes them more powerful, but everything works without them.
- **Chain skills together.** `/prd-draft` → `/prd-review-panel` → `/create-tickets` is a full PRD lifecycle in three commands.
