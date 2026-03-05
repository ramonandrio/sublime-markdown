---
name: setup
description: First-time onboarding — set up your CompassAI context in 5 steps
user-invocable: true
---

## Purpose

Walk the PM through their first-time setup. Fills in `context/MY-PROFILE.md`, `context/MY-COMPANY.md`, `context/MY-TEAM.md`, and `context/products/` from documents they provide, web search, and free-form input.

Run this once. Takes 10-15 minutes.

---

## First-Session Auto-Detection

Before doing anything else, check whether setup has already been done:

1. Read `context/MY-COMPANY.md` — if it still contains `[Acme Corp]` or similar placeholder, setup is pending.
2. Read `context/MY-PROFILE.md` — if it contains `[Your name]`, setup is pending.

**If setup is pending and the PM hasn't explicitly run `/setup`:**
```
Welcome! Before we get to work, let's take 10 minutes to set up your CompassAI.
I'll ask you for a few things and fill in your context files automatically.

Run `/setup` to get started — or skip it and come back later.
Everything works without it, just with less personalization.
```

**If setup is already done:** Skip this skill entirely.

---

## Flow

Run each step sequentially. After each one, confirm what was written and ask if the PM wants to continue.

---

### Step 1 of 5 — Your Profile

```
Step 1 of 5 — Your Profile

Share your LinkedIn profile (PDF export works great) and anything else
you want me to know about you as a PM.

You can also just write a few sentences: current role, background,
what kind of PM you are.

[Upload file or write freely]
```

**What to extract:**
- Current role and company
- Years of experience
- Types of products worked on (B2B/B2C, mobile/web, platform/consumer)
- Background before PM (engineering, design, business, etc.)
- Any strengths or working preferences mentioned

**Write to:** `context/MY-PROFILE.md`

**Confirm:**
```
Got it. I've filled in your profile at context/MY-PROFILE.md.

[1-line summary of what was captured]

Ready for step 2?
```

---

### Step 2 of 5 — Your Company

```
Step 2 of 5 — Your Company

Tell me where you work. I'll search for public information and combine it
with anything you share.

- Company name (required)
- Any docs you want to upload: pitch deck, annual report, strategy doc,
  investor update, product one-pager — anything that describes the company
- A free-form comment: things the public info won't capture
  (culture, internal priorities, where the company is really headed)

[Upload files and/or write freely]
```

**What to do:**
1. Run a web search on the company name to find: industry, stage, product, funding, competitors, recent news
2. Read any uploaded documents
3. Combine both sources, prioritizing the PM's own input over public info

**Write to:** `context/MY-COMPANY.md`

**Confirm:**
```
Done. I've filled in context/MY-COMPANY.md with what I found.

[2-3 line summary: company, stage, what they do, main competitors]

Anything to correct before we move on?
```

---

### Step 3 of 5 — Your Team

```
Step 3 of 5 — Your Team

Share who you work with. A screenshot of your org chart works,
or just tell me who's who.

The most useful people to capture:
- Your manager
- Your immediate team (EM, designer, engineers)
- Key stakeholders (VP Sales, Head of CS, etc.)

For each person, a name + role is enough. Add anything else you know
about how they work or what they care about.

[Upload screenshot or write freely]
```

**What to do:**
- If a screenshot is provided: use vision to extract names and roles from the org chart
- If written: parse names, roles, and any notes
- For each person, capture: name, role, and any working notes the PM mentions

**Write to:** `context/MY-TEAM.md`

**Confirm:**
```
Done. I've captured [N] people in context/MY-TEAM.md.

[List names and roles as a quick recap]

Anyone missing or anything to add?
```

---

### Step 4 of 5 — Your Products

```
Step 4 of 5 — Your Products

Tell me about the product (or products) you work on.

Upload any docs you have: PRDs, one-pagers, specs, launch notes,
strategy decks — anything that describes what you're building.

Or just tell me: what does the product do, who's it for,
what are the main metrics you care about?

If you work on more than one product, we'll create a separate file for each.

[Upload files and/or write freely]
```

**What to do:**
- Identify if there's one product or multiple
- For each product, extract: name, description, target user, key metrics, active work
- Create one file per product

**Write to:** `context/products/[product-name].md` (one file per product)

**Confirm:**
```
Done. I've created [N] product file(s) in context/products/:
- [product-name].md — [one-line description]

Want to adjust anything before we wrap up?
```

---

### Step 5 of 5 — Write memory + Start Something

Before presenting options, write a starter MEMORY.md to your auto-memory directory.

**What to write:**

```markdown
# CompassAI Memory

## ⚠️ Drift Guard — this file

You may ADD new entries to any section. You may NOT edit existing entries
in the same session you're adding to them.

This protects against gradual drift through accumulated in-session edits.
If something you wrote earlier in this session is wrong, note the correction
as a new dated entry — don't rewrite the original.

---

## PM
Name: [name]
Role: [role] at [company]
Background: [summary from LinkedIn/profile]
Working style: [any notes from MY-PROFILE.md]

## Company
Name: [company]
Industry: [industry]
Stage: [stage]
Priorities: [quarterly priorities]
Competitors: [main competitors]

## Products
[product name] — [one-line description] — [target user]

## Active initiatives
(none yet)

## Team & stakeholders
[name] — [role] — [notes]

## Preferences
Language: [language the PM communicates in]

## Learnings
_All entries are dated. Most recent first._

_[YYYY-MM-DD]_ — (none yet)
```

Then present:

```
Setup complete. Your CompassAI is ready.

Here's what I now know about you:
- You're [role] at [company]
- Working on: [products]
- Team: [N] people captured
- Company stage: [stage], focused on [priorities]

I've also saved this to memory so I'll remember it in every future session.

What do you want to work on first?

→ /prd-draft — Start a new initiative
→ /daily-plan — Get a plan for today
→ /meeting-notes — Process a meeting transcript
→ /weekly-plan — Set this week's priorities

Or just tell me what's on your mind.
```

---

## Error Handling

**PM skips a step:**
```
No problem. You can always fill that in later by editing the file directly
or telling me: "Update my company info — [new info]."
```

**PM uploads an image that's hard to read:**
```
The image is a bit hard to parse. Can you tell me the key people?
Just names and roles is enough.
```

**PM works at a stealth / confidential company:**
```
Got it — I'll skip the web search and work only from what you share with me.
```

**Setup already partially done:**
- Check which files still have placeholder content
- Only run the steps that are still empty
- Skip the rest with: "I see you've already set up [company/team/products]. Skipping to step [N]."
