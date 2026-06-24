---
name: write-blog
description: Draft a standalone blog post (a "post" — single .md file under a category) for this repo. Triggered when the user asks to write/draft/add a post, article, or blog entry that is NOT a multi-chapter series. Enforces this repo's terminology, frontmatter, length, and tag conventions from AGENTS.md.
---

# write-blog

Use this skill to draft a **standalone post** — a single `.md` file living directly inside one of the four categories. A post is *not* a series and *not* a chapter. If the user wants multi-chapter content, use `write-series` instead.

AGENTS.md is the source of truth for repo conventions. Re-read it if anything below conflicts.

## Step 1 — Lock the brief before writing a single line

Ask the user (in one short batch) for whatever is missing:

1. **Category** — `technical`, `product-mindset`, `design-ux`, or `growth-softskill`
2. **Working title** — final title can be tweaked later
3. **Slug** — kebab-case filename without `.md` (e.g. `optimistic-vs-pessimistic-locking`)
4. **Audience & angle** — who is this for, and what is the *one* thing they should walk away with? A post without a thesis becomes a Wikipedia page.
5. **Tags** — 3–6 tags, **lowercase-kebab-case** (e.g. `databases`, `system-design`, `ci-cd`). Case-sensitive: `Agile` ≠ `agile`.

Do not skip the angle. If the user is vague, push back with one direct question — don't proceed with a fuzzy thesis.

## Step 2 — Outline before prose

Propose an outline with 3–6 H2 sections. Show it to the user and wait for sign-off (or ask if they want to skip review and go straight to draft). Each section should map to one beat of the argument, not just a topic dump.

Common solid shapes:
- Problem → why naive solutions fail → the right approach → tradeoffs → when to use which
- Concept → mechanics → concrete example → pitfalls
- Claim → evidence → counter-argument → resolution

## Step 3 — Write the post

File: `content/{category}/{slug}.md`

**Frontmatter template:**
```yaml
---
title: "Your Final Title"
description: "One sentence shown on cards and search results — sell the thesis, don't just describe the topic."
tags: ["tag-one", "tag-two", "tag-three"]
date: "YYYY-MM-DD"   # use today's date
draft: false
lang: "en"           # or "vi"
---
```

**Body rules (from AGENTS.md):**
- **Do NOT repeat the title as `# H1`.** The page renders the title automatically. Start the body with prose or jump straight to `##`.
- Length target: **100–250 lines** of markdown. Tight is better. Cut redundant sections, merge related points, and don't over-explain concepts the audience already knows.
- Code blocks: fenced with language tag for syntax highlighting.
- Math: `$inline$` and `$$block$$` (KaTeX is wired up).
- Images: **Cloudinary only** — `https://res.cloudinary.com/dmwr6giop/image/upload/f_auto,q_auto/{version}/{filename}`. Never reference local paths. If the user mentions adding an image, remind them to upload to Cloudinary first.

**Style guardrails:**
- Open with the problem or the punchline, not throat-clearing ("In this post we will explore...").
- Prefer concrete examples over abstract definitions.
- One idea per paragraph. Short paragraphs.
- End with a takeaway or "when to use which" — not a generic summary.

## Step 4 — After saving the file

1. Run a final length check (`wc -l content/{category}/{slug}.md`). If it's >250 lines, propose specific cuts. If it's <80, ask whether to expand or accept as a short note.
2. **Ask the user whether they want an AudioPlayer added to the post.** This is mandatory per AGENTS.md workflow. Do not add it without asking. AudioPlayer is for posts/chapters only — never for category or series README files.
3. Offer to run `npm run build` to catch frontmatter or markdown errors before commit.

## Hard "do not" list

- ❌ Don't add an `# H1` matching the title
- ❌ Don't set `category:` in frontmatter (the folder *is* the category)
- ❌ Don't use `Title-Case` or `CamelCase` tags
- ❌ Don't use `toLocaleDateString()` anywhere in code (irrelevant here, but a recurring footgun)
- ❌ Don't reference local image paths (`/images/...`)
- ❌ Don't auto-add an AudioPlayer without asking
