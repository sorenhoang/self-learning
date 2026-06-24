---
name: write-series
description: Draft a multi-chapter series (a category subfolder with README.md + numbered chapter files) for this repo. Triggered when the user asks for a series, multi-part post, or anything that won't fit in a single ≤250-line post. Enforces this repo's series/chapter terminology, frontmatter, and ordering from AGENTS.md.
---

# write-series

Use this skill to draft a **series** — a subfolder inside a category containing a `README.md` (series overview) plus one numbered `.md` file per **chapter**. A series is *not* a post. If the work fits in a single 100–250 line file, use `write-blog` instead.

AGENTS.md is the source of truth. Re-read it if anything below conflicts.

## Terminology guardrail

- A **series** is the folder. It has a `README.md` with overview metadata and body.
- A **chapter** is a single `.md` file inside the series folder, named `NN-slug.md`.
- Never call a series a "book", "guide", or "course". Never call a chapter an "article" or "page".

## Step 1 — Plan the whole series before writing chapter 1

Ask the user (one batch):

1. **Category** — `technical`, `product-mindset`, `design-ux`, or `growth-softskill`
2. **Series title** — full reader-facing title (e.g. *Auth in Depth: From Passwords to Zero Trust*)
3. **Series slug** — kebab-case folder name (e.g. `auth-in-depth`)
4. **Audience & promise** — who is it for, what will they be able to do/understand at the end?
5. **Scope** — typically 4–16 chapters. Anything <4 should probably be a long post; >16 should probably be split.
6. **Tags** — 3–8 tags, **lowercase-kebab-case** (e.g. `system-design`, `databases`). Series tags drive tag pages; chapter tags are decorative only.

Then **propose a chapter list** as a table with chapter numbers + working titles, grouped into 3–5 logical "Parts" if the series is long. Get the user to sign off on the spine before writing any chapter content. Re-numbering 12 chapters mid-draft is painful.

## Step 2 — Create the folder and the series README

Folder: `content/{category}/{series-slug}/`

**`README.md` frontmatter:**
```yaml
---
title: "Series Title: Optional Subtitle"
description: "One paragraph summarizing the series promise and who it is for."
tags: ["tag-one", "tag-two", "tag-three"]
date: "YYYY-MM-DD"   # use today's date
draft: false
---
```

> ⚠️ Do **not** put `order:` on the series README — it's ignored. Do **not** put `lang:` on the README either; that field is per chapter.

**Body of `README.md`:**
- Start with `## Overview` (no `# H1` matching the title).
- Include a chapter table grouped into Parts. Reference `content/technical/auth-in-depth/README.md` as the canonical structural template.
- Close with a "Who this is for" section and a one-line nudge to chapter 1.

## Step 3 — Write chapters one at a time

File pattern: `content/{category}/{series-slug}/NN-chapter-slug.md` where `NN` is zero-padded and matches the `order` field.

**Chapter frontmatter:**
```yaml
---
title: "Chapter Title"
order: 1
tags: ["tag-one"]
date: "YYYY-MM-DD"
draft: false
lang: "en"
---
```

> ⚠️ Do **not** set `description:` on a chapter — it's ignored by `content.ts`.

**Numbering tips:**
- Use gaps (`order: 10, 20, 30`) only if you're confident the series will need late insertions; otherwise plain `1, 2, 3` is fine.
- The filename `NN` and the `order` field should agree. If they drift, sidebar order follows `order`, but the URL slug comes from the filename — confusing.

**Body rules (same as posts):**
- **Do NOT repeat the chapter title as `# H1`.** The page already renders it.
- Each chapter should stand on its own enough that a reader landing from search can follow it, but reference earlier chapters by name when building on them.
- Length: chapters are usually longer than standalone posts (200–500 lines is normal), but stay tight — don't pad.
- Code, math, and image rules are identical to posts. Cloudinary only.

## Step 4 — After each chapter file

1. **Ask whether to add an AudioPlayer to that chapter.** Per AGENTS.md, this prompt is mandatory after creating any chapter or post. Never on series README, never on category README.
2. Confirm the next chapter number with the user before continuing — sometimes scope shifts mid-series.

## Step 5 — When the series is "done"

- Run `npm run build` to catch frontmatter errors and verify all 40+ static pages still generate.
- Update the series README chapter table if any titles changed during drafting.
- Suggest a short LinkedIn/Twitter blurb if the user wants to announce it (optional — only if asked).

## Hard "do not" list

- ❌ Don't put `description:` on chapters
- ❌ Don't put `order:` on the series README
- ❌ Don't repeat the title as `# H1` in any chapter or the README
- ❌ Don't write all chapters before getting outline sign-off
- ❌ Don't auto-add AudioPlayer without asking, and never add it to README files
- ❌ Don't use Title-Case or CamelCase tags — `lowercase-kebab-case`, case-sensitive
