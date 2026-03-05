---
name: deep-research
description: Build a deep research prompt through conversation, then ingest the results into your context
user-invocable: true
---

## Purpose

Help the PM define exactly what they want to research, generate a high-quality prompt ready to paste into any deep research tool, and bring the results back into the CompassAI context once the research is done.

---

## Flow

### Phase 1 — Understand the research goal

Start with one open question:

```
What do you want to research?
```

Then ask follow-up questions to sharpen the scope. Don't ask all at once — read the PM's answer and ask only what's still unclear. Typical questions:

- **Why now?** What decision or initiative is this research for?
- **What do you already know?** What's your current understanding or hypothesis?
- **What would change your mind?** What finding would surprise you or shift your thinking?
- **What's the scope?** Geographic, industry, time horizon, user segment?
- **What format is most useful?** Competitive landscape, market sizing, user behavior, technical overview, regulatory context...
- **How deep?** Quick orientation (30 min read) or thorough analysis (full report)?

Keep going until you can answer: *What exactly does the PM need to know, and why?*

---

### Phase 2 — Generate the research prompt

Once you have a clear picture, generate a structured prompt the PM can paste directly into their deep research tool.

The prompt should include:

1. **Research goal** — one clear sentence on what this research should answer
2. **Context** — what the PM already knows, what product/decision this is for
3. **Key questions** — 4-6 specific questions the research should cover
4. **Scope constraints** — what's in and out (geography, time range, segment, etc.)
5. **Output format** — what the final deliverable should look like (structured report, comparison table, executive summary, etc.)
6. **Sources to prioritize** — industry reports, academic research, news, company filings, user forums, etc.

Present it clearly:

```
Here's your deep research prompt. Copy and paste it into your tool of choice.

---
[PROMPT]
---
```

Then suggest which tool to use based on the type of research:

- **Perplexity Deep Research** — great for competitive and market research, real-time sources
- **ChatGPT Deep Research** — strong for structured reports and synthesis across many sources
- **Gemini Deep Research** — good for technical topics and Google-indexed content
- **Claude** (with extended thinking or Projects) — best when you want to iterate on findings in the same conversation

---

### Phase 3 — Suggest NotebookLM

After presenting the prompt:

```
Once you have the research output, consider running it through NotebookLM
(notebooklm.google.com) to:

- Generate a podcast-style audio summary (great for commutes or quick catch-up)
- Create a slide outline for sharing with your team
- Ask follow-up questions on the source material

Upload the PDF or paste the text into a new notebook.
```

---

### Phase 4 — Ingest the results

After presenting the prompt, tell the PM:

```
When you get the research back, share it here and tell me which product
or initiative it's for. I'll save it to the right place in your context
so it informs future PRDs, strategy docs, and analysis.
```

When the PM returns with a PDF or pasted content:

1. **Ask if not clear:** "Which product or initiative is this research for?"
2. **Determine where it belongs:**
   - If it's about a specific initiative → save to `projects/[Recursos][Producto]Nombre/research.md` (append or create)
   - If it's about a product in general → save to `context/products/[product-name].md` (add a Research section)
   - If it's about the market or company in general → save to `context/MY-COMPANY.md` (add a Market Intelligence section) or a new file in `context/`
3. **Summarize what was added:**

```
Saved. Here's what I captured from the research:

- [Key finding 1]
- [Key finding 2]
- [Key finding 3]

It's now in [file path] and will inform your work on [product/initiative].
```

---

## Example conversation

```
PM: /deep-research

Claude: What do you want to research?

PM: I want to understand how legal tech companies are using AI for document review

Claude: Got it. A few questions to sharpen the scope:

What's this for — a competitive analysis, a feature decision, or something else?

PM: We're building an AI document review feature and I want to understand what already exists,
    what works, what doesn't, and what the pricing models look like.

Claude: What's your current hypothesis — where do you think the market is today?

PM: I think most tools are expensive and focused on large law firms, and there's a gap
    for mid-market firms.

Claude: One more — what would most change your thinking? What finding would surprise you?

PM: If mid-market firms are already well-served, that would make me rethink our positioning.

Claude: Perfect. Here's your research prompt:

---
[Detailed prompt generated]
---

Paste this into Perplexity Deep Research or ChatGPT Deep Research.
Once you get the output, share it here and I'll save it to your product context.
```
