# Sub-Agents Reference

7 specialist reviewers that adopt a specific perspective when evaluating your work.

## How to use them

Ask Claude to review any document from a specific perspective:

```
Review this PRD from an engineering perspective.
Review this spec as a designer would.
Give me the executive take on this proposal.
```

Or combine several in one request:

```
Review this PRD from the perspective of an engineer, a designer, and a skeptic.
```

Claude will read the corresponding sub-agent file and adopt that mindset.

---

## The Reviewers

### Engineer
**File:** `sub-agents/engineer-reviewer.md`

Senior software engineer. Focuses on technical feasibility, complexity, maintainability, performance, and hidden dependencies. Direct and constructive — flags issues early to prevent problems later, not to block progress.

**Ask when:** You want to know if something is actually buildable, how hard it really is, or whether you're creating technical debt.

---

### Designer
**File:** `sub-agents/designer-reviewer.md`

Senior product designer. Focuses on user experience, usability, accessibility, visual consistency, and delight. User-centric and detail-oriented. Asks "why" a lot.

**Ask when:** You want feedback on flows, interactions, edge cases in the UI, or whether the solution is intuitive enough.

---

### Executive
**File:** `sub-agents/executive-reviewer.md`

VP of Product or CPO. Focuses on strategic alignment, business impact, resource efficiency, market positioning, and risk. Thinks in quarters and years, not sprints.

**Ask when:** You need to pressure-test whether this is the right bet, whether it moves the needle, or how to frame it upward.

---

### Legal Advisor
**File:** `sub-agents/legal-advisor.md`

Product counsel. Flags privacy, data protection, compliance, and regulatory risk. Covers GDPR, CCPA, terms of service, IP, and accessibility requirements.

**Ask when:** Your feature touches user data, third-party integrations, content moderation, payments, or regulated industries.

---

### UXR Analyst
**File:** `sub-agents/uxr-analyst.md`

UX researcher. Evaluates whether features are grounded in real user evidence. Flags assumptions presented as facts, missing research, and gaps between what users say and what they do.

**Ask when:** You want to know if your PRD is solving a real problem or if you're building on shaky assumptions.

---

### Skeptic
**File:** `sub-agents/skeptic.md`

The "but why?" voice. Challenges problem validation, solution fit, scope creep, success metrics, and timeline assumptions. Not here to block — here to make the work stronger.

**Ask when:** You want someone to poke holes before you present to stakeholders, or when you suspect you might be too close to the problem.

---

### Customer Voice
**File:** `sub-agents/customer-voice.md`

The actual user. No product jargon. Just: does this solve my problem, can I figure it out, and why should I care? Focuses on clarity, onboarding friction, and whether the value is obvious.

**Ask when:** You want a gut-check on whether real users would understand and use what you're building.

---

## Bonus: Ralph Wiggum
**File:** `sub-agents/ralph-wiggum.md`

Not a reviewer — a technique. Runs Claude in an autonomous iterative loop until a task meets its completion criteria. Useful for tasks that require repeated attempts to get right (complex code, thorough analysis, multi-step generation).

**Use when:** You want Claude to keep working on something until it's truly done, without you having to re-prompt.

---

## Combining reviewers

For a full PRD review, try:

```
/prd-review-panel
```

This runs all 7 perspectives automatically and synthesizes the feedback. Or pick 2-3 perspectives manually for a lighter review.
