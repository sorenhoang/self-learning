import fs from "fs";
import path from "path";
import matter from "gray-matter";

// System Design is a standalone tracker, not a content category: it lives outside content/
// so buildContentTree() never picks it up.
const DIR = path.join(process.cwd(), "system-design");

export interface Problem {
  id: number;
  name: string;
  slug: string;
  gi: number;
  done: boolean;
}

export interface ProblemGroup {
  name: string;
  description: string;
  items: Problem[];
}

const toSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function getSystemDesign() {
  const { data } = matter(fs.readFileSync(path.join(DIR, "README.md"), "utf-8"));
  let seq = 0;
  // Numbers follow display order; files are keyed by slug so reordering never detaches content.
  const groups: ProblemGroup[] = (
    data.groups as { name: string; description: string; items: string[] }[]
  ).map((g, gi) => ({
    name: g.name,
    description: g.description,
    items: g.items.map((name) => {
      const slug = toSlug(name);
      return { id: ++seq, name, slug, gi, done: fs.existsSync(path.join(DIR, `${slug}.md`)) };
    }),
  }));
  return {
    title: data.title as string,
    description: data.description as string,
    groups,
    all: groups.flatMap((g) => g.items),
  };
}

export function getProblemContent(slug: string): string | null {
  const file = path.join(DIR, `${slug}.md`);
  return fs.existsSync(file) ? matter(fs.readFileSync(file, "utf-8")).content : null;
}
