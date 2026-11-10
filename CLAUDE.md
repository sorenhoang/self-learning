# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Turbopack) → http://localhost:3000
npm run build    # Production build — runs TypeScript check + generates all static pages
npm run lint     # ESLint
npm run start    # Serve production build locally
```

The build is the primary way to catch errors — it runs TypeScript strict mode and generates all 40+ static pages via `generateStaticParams`.

## Content terminology

Use these terms consistently — in code, comments, commit messages, and conversations:

| Term | What it is | Example |
|---|---|---|
| **category** | A top-level folder in `content/` with a `README.md` | `technical/`, `product-mindset/` |
| **series** | A subfolder inside a category — a multi-chapter series | `technical/system-design-fundamentals/` |
| **chapter** | A single `.md` file inside a series | `01-introduction.md` |
| **post** | A standalone `.md` file directly inside a category | `technical/docker-essentials.md` |

The full hierarchy: `category → series → chapter` and `category → post`.

> Never call a series a "book", "guide", or "course". Never call a chapter an "article" or "page".

---

## Architecture

### Content ↔ Code in the same repo

All Markdown lives in `/content/`, read at **build time** via Node.js `fs` — no GitHub API, no network calls. Every `git push` triggers a Vercel rebuild that re-reads all content.

```
content/
  {category}/
    README.md                  ← category metadata (title, description)
    {series}/
      README.md                ← series metadata + overview body
      01-chapter-slug.md       ← chapter (order field controls sidebar sort)
    {post-slug}.md             ← standalone post
```

### How a URL maps to content

`resolveSlugType(category, slug)` in `src/lib/content.ts` checks the filesystem to decide whether a slug is a **series** (directory) or **post** (`.md` file). This is what `[category]/[slug]/page.tsx` uses to branch its rendering.

```
/                              → src/app/page.tsx
/{category}                    → src/app/[category]/page.tsx
/{category}/{slug}             → same page, branches on resolveSlugType()
/{category}/{slug}/{chapter}   → src/app/[category]/[slug]/[chapter]/page.tsx
/tags/{tag}                    → src/app/tags/[tag]/page.tsx
/system-design                 → src/app/system-design/ (standalone tracker, NOT a category)
/api/search-index              → static JSON built from buildSearchIndex()
/api/og                        → edge function, generates OG images on demand
```

### System Design tracker

`system-design/` (repo root, outside `content/`) is a standalone tracker with its own sidebar layout, not a category. Groups and problem titles live in `system-design/README.md` frontmatter (`groups:`). A problem is "learned" once `system-design/<slug>.md` exists (slug = kebab-case title); otherwise it shows "Soon". Read by `src/lib/system-design.ts`.

### Core data layer (`src/lib/content.ts`)

- `buildContentTree()` — reads all categories/series/posts from `content/`, returns typed tree. Called in every page's Server Component.
- `buildSearchIndex(tree)` — flattens tree to `SearchEntry[]`. Seriess return series URL even if a chapter matched; posts return post URL.
- `resolveSlugType(category, slug)` — `"series" | "post" | null`, used to branch `[slug]/page.tsx`.
- `draft: true` in frontmatter hides content **in production only** (`NODE_ENV === "production"`). Drafts are visible in dev.

### Markdown pipeline (`src/lib/markdown.ts`)

`unified → remark-parse → remark-gfm → remark-math → remark-rehype → rehype-slug → rehype-autolink-headings → rehype-pretty-code → rehype-katex → rehype-stringify`

- Syntax highlighting via Shiki with dual themes (`github-dark` / `github-light`)
- LaTeX via KaTeX — CSS imported in `src/app/layout.tsx`
- `extractToc(content)` parses headings from raw markdown for the sticky TOC sidebar

### Dark mode

Class-based via `@custom-variant dark` in `globals.css`. An inline script in `<html><head>` reads `localStorage` and applies `.dark` / `.light` to `<html>` before React hydrates — prevents FOUC. `suppressHydrationWarning` on `<html>` is intentional and required.

`ThemeToggle.tsx` cycles light → dark → system, persists to `localStorage`.

### Search

Client-side via Fuse.js. The index is a static Route Handler at `/api/search-index` (`force-static`, built at compile time). `SearchModal` fetches it once on first open and caches in component state. Opened via ⌘K, handled only in `Header.tsx`.

### Frontmatter schema

| Field | Where | Notes |
|---|---|---|
| `title` | all | required |
| `description` | category/series README, post | ignored on chapters — don't set |
| `tags` | series README, post, chapter | **lowercase-kebab-case only** (e.g. `"ci-cd"`, not `"CI/CD"` or `"CiCd"`). Comparison is case-sensitive — `"Agile"` and `"agile"` produce two separate tag pages. Tag pages are built only from series + post tags, not chapter tags (chapter tags are decorative only). |
| `order` | chapter only | integer, controls sidebar sort. Not read on series README. |
| `date` | series README, post, chapter | `YYYY-MM-DD` |
| `draft` | series README, post, chapter | hidden in production |
| `cover` | series README, post | declared in types, not yet rendered |
| `lang` | chapter, post | optional — passed to `AudioPlayer` (`"en"` → `en-US`, `"vi"` → `vi-VN`). Defaults to `"en"`. |

**Do not set these fields** — they were used historically but are now ignored by `content.ts`:
- `category:` in any frontmatter. The URL-segment folder *is* the category.
- `description:` on a chapter file.
- `order:` on a series README.

### Key constraints

- **Never use `toLocaleDateString()`** — use `formatDate(dateStr)` from `src/lib/date.ts` instead. It parses `YYYY-MM-DD` strings deterministically to avoid server/client hydration mismatches.
- `params` and `searchParams` props in page/layout components are **Promises** in Next.js 15+ and must be `await`ed. In Route Handlers, `request.nextUrl.searchParams` is a synchronous Web API `URLSearchParams` — do not await it.
- The 3-column reading layout (Sidebar + content + TOC) hides `Sidebar` on `< lg` and `TableOfContents` on `< xl`. `MobileSidebar` provides chapter navigation on mobile via a bottom drawer (chapter pages only).
- **Do not repeat the chapter/post title as an `# H1`** in the markdown body. The chapter page (`src/app/[category]/[slug]/[chapter]/page.tsx`) already renders `currentChapter.title` as the page `<h1>`. Start the body at `##` so there is only one H1 per page.

## Workflow conventions

- **Adding new content**: whenever a new **chapter** or **post** is created, ask the user whether they want to add an `AudioPlayer` to it before finishing. `AudioPlayer` must NOT be added to series metadata (`series/README.md`) or category metadata (`category/README.md`).
- **Blog post length**: standalone posts should be concise — aim for **100–250 lines** of markdown. Cut redundant sections, merge related points, and avoid over-explaining concepts the audience already understands. Tighter is better.
- **Images**: all images are hosted on Cloudinary (cloud name: `dmwr6giop`). Never reference local paths like `/images/...`. Always use the Cloudinary URL format with `f_auto,q_auto` transformations: `https://res.cloudinary.com/dmwr6giop/image/upload/f_auto,q_auto/{version}/{filename}`. If a contributor mentions adding an image, remind them to upload to Cloudinary first.

## Project skills

Three project-level skills live in `.claude/skills/` and are tracked in git. Use the `Skill` tool (or follow the SKILL.md instructions inline) when the user's request matches:

| Skill | Use when the user wants to… |
|---|---|
| `write-blog` | …draft a **standalone post** (single `.md` file under a category). Enforces frontmatter, 100–250 line target, no-`# H1`-in-body, lowercase-kebab-case tags, and the AudioPlayer prompt. |
| `write-series` | …draft a **multi-chapter series** (subfolder with `README.md` + numbered chapters). Forces outline sign-off before writing chapter 1, gets `order` discipline right, and prevents the common `description:` / `order:` frontmatter mistakes. |
| `research-content` | …**research a topic before drafting**. Returns a thesis-driven research brief (sources, debates, pitfalls, proposed angle, suggested format) — does NOT write the post. |

If the user asks "write a post about X" with no signal about research, ask whether they want `research-content` first or already have the angle. The skills are layered: research → write-blog or research → write-series.

## Environment variables

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.vercel.app
```

Used for sitemap, robots.txt, and OG image absolute URLs. See `.env.example`. Set in the Vercel dashboard before deploying.
