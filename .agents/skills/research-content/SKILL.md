---
name: research-content
description: Research a topic before drafting a post or series — gather sources, surface debates, identify pitfalls, and propose a thesis + outline. Triggered when the user wants to learn/explore/research a topic, or explicitly says "research before writing". Outputs structured notes, NOT a draft.
---

# research-content

Use this skill **before** `write-blog` or `write-series`. The output is a research brief the user can review and approve — not a finished post. Keeping research a separate phase is what stops drafts from becoming generic Wikipedia summaries with no point of view.

If the user asks to "write a post about X" with no research signal, do not silently assume they want research first. Ask: *"Do you want me to research first, or do you already have the angle?"*

## What this skill produces

A single research brief (returned in chat, or saved to a scratch file under `notes/` if the user asks). The brief has these sections — fill the ones that apply, drop the rest:

1. **Topic & framing** — one-sentence definition, plus what the topic is *not* (scope guardrail)
2. **Audience hypothesis** — who would read this, and what they probably already know
3. **Key concepts** — 5–10 bullets of load-bearing ideas with one-line explanations
4. **Current state / debates** — where reasonable engineers disagree; this is where a unique angle usually lives
5. **Common pitfalls & misconceptions** — what beginners get wrong, what experienced people still get wrong
6. **Concrete examples / case studies** — real systems, papers, postmortems, or code patterns worth referencing
7. **Sources** — list each with URL and a one-line note on why it's worth citing or linking
8. **Proposed angle / thesis** — 1–3 candidate angles, each with the "so what?" stated explicitly
9. **Suggested format** — post (≤250 lines) or series (with rough chapter list); justify the choice
10. **Open questions** — what the user needs to decide before drafting

## Step 1 — Clarify scope

Before searching, ask the user (one batch, only what's missing):

- What's the topic, and what's the *boundary* — what should be out of scope?
- Format hint: are you thinking post or series? (Use this only as a hint, not a commitment — the research may push you the other way.)
- Audience: junior engineers? senior? PMs? mixed?
- Personal angle: do you have prior experience with this topic, or are you researching from scratch? (Affects how much foundational explanation is needed.)
- Any sources or references they already have in mind?

## Step 2 — Search and read

Use `WebSearch` and `WebFetch` deliberately:

- Start broad to map the territory (3–5 searches), then narrow into specific subtopics.
- Look for **primary sources**: original papers, RFCs, official docs, vendor postmortems, well-known engineering blogs (Stripe, Cloudflare, Shopify, GitHub, Netflix, Uber, Google, AWS).
- Look for **counter-takes**: "X considered harmful", "the case against Y" — these surface the debates that make a post sharp.
- For technical topics, find at least one **failure mode / postmortem** — concrete pain teaches more than abstract advice.
- Skip listicle SEO content unless it's the only source.

Cap the search budget at ~10–15 fetches unless the user explicitly asks for deeper dive. Research is expensive; don't burn tokens reading every link.

## Step 3 — Synthesize, don't summarize

Bad research output reads like a Wikipedia article. Good research output answers:

- **What's the *interesting* thing here?** — the non-obvious mechanism, the surprising tradeoff, the place where intuition fails
- **Where do experts disagree?** — name the camps, not just "opinions vary"
- **What does the user already know vs. need to learn?** — calibrates the draft

If after research you can't articulate a thesis stronger than "X is important and here's how it works", say so. A weak topic is a fine outcome — better to discover it now than after writing 200 lines.

## Step 4 — Recommend a format

Use these heuristics:

- **Post** if: one core idea, ≤250 lines of explanation, audience has prerequisites
- **Series** if: builds on itself across multiple concepts, would otherwise need a 600+ line post, or the user explicitly wants depth
- **Skip / pivot** if: the topic is well-covered elsewhere with no new angle to add — recommend a different framing

Then propose a concrete next step: *"If you want a post, the slug would be `xxx` and the outline is [...]"* or *"If you want a series, here's a 6-chapter spine [...]"*.

## Step 5 — Save outputs only if asked

Default: return the brief in chat for review. If the user asks to save it, write to `notes/research-{slug}.md` (create `notes/` if needed). The `notes/` directory is for working files and is **not** read by the build pipeline — `content/` is the only directory that gets published.

## Hard "do not" list

- ❌ Don't write the post during research — research and drafting are separate phases
- ❌ Don't dump raw search results — synthesize
- ❌ Don't propose a thesis you can't defend with at least one concrete source
- ❌ Don't recommend `series` for a topic that fits in a post just to look thorough
- ❌ Don't save research output into `content/` — that publishes it
