import Link from "next/link";
import type { CategoryMeta } from "@/types/content";

export interface TrackerGroup {
  name: string;
  description?: string;
  items: string[];
}

const toSlug = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Renders a category as a learning tracker: an item is "learned" once a post with its slug exists.
export default function ProblemTracker({
  category,
  groups,
}: {
  category: CategoryMeta;
  groups: TrackerGroup[];
}) {
  const postSlugs = new Set(category.posts.map((p) => p.slug));
  let seq = 0;
  const numbered = groups.map((g) => ({
    ...g,
    items: g.items.map((title) => {
      const slug = toSlug(title);
      return { id: ++seq, title, slug, done: postSlugs.has(slug) };
    }),
  }));
  const all = numbered.flatMap((g) => g.items);
  const learned = all.filter((i) => i.done).length;

  return (
    <div className="max-w-2xl">
      <div className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        {learned} / {all.length} learned
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-green-500"
            style={{ width: `${(learned / all.length) * 100}%` }}
          />
        </div>
      </div>

      {numbered.map((g) => (
        <details
          key={g.name}
          open
          className="group border-t border-zinc-200 dark:border-zinc-800"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 py-3 font-semibold text-zinc-900 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
            <span className="text-xs text-zinc-400 transition-transform group-open:rotate-90">
              ▸
            </span>
            <span className="flex-1">{g.name}</span>
            <span className="text-sm font-normal tabular-nums text-zinc-400">
              {g.items.filter((i) => i.done).length}/{g.items.length}
            </span>
          </summary>
          {g.description && (
            <p className="mb-2 pl-5 text-sm text-zinc-500 dark:text-zinc-400">
              {g.description}
            </p>
          )}
          <ul className="mb-3">
            {g.items.map((item) => {
              const row = (
                <>
                  <span className="w-6 text-xs tabular-nums text-zinc-400">{item.id}</span>
                  <span className="flex-1">{item.title}</span>
                  {item.done ? (
                    <span className="rounded-full bg-green-500/15 px-2 text-xs font-semibold text-green-600 dark:text-green-400">
                      ✓
                    </span>
                  ) : (
                    <span className="rounded-full border border-zinc-200 px-2 text-xs text-zinc-400 dark:border-zinc-700">
                      Soon
                    </span>
                  )}
                </>
              );
              return (
                <li key={item.slug}>
                  {item.done ? (
                    <Link
                      href={`/${category.slug}/${item.slug}`}
                      className="flex items-center gap-2 rounded-md py-1.5 pl-5 pr-2 text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 py-1.5 pl-5 pr-2 text-sm text-zinc-400">
                      {row}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}
