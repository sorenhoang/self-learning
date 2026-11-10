"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ProblemGroup } from "@/lib/system-design";

export default function Sidebar({
  title,
  groups,
}: {
  title: string;
  groups: ProblemGroup[];
}) {
  const pathname = usePathname();
  const all = groups.flatMap((g) => g.items);
  const learned = all.filter((p) => p.done).length;

  return (
    <aside className="border-b border-zinc-200 bg-white px-3.5 py-6 dark:border-zinc-800 dark:bg-zinc-900 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <Link href="/system-design" className="block px-2 text-[19px] font-extrabold tracking-tight">
        {title}
      </Link>
      <div className="px-2 pb-5 pt-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
        {learned} / {all.length} learned
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <i className="block h-full bg-green-600 dark:bg-green-400" style={{ width: `${(learned / all.length) * 100}%` }} />
        </div>
      </div>

      <nav>
        {groups.map((g) => (
          <details
            key={g.name}
            open={g.items.some((p) => pathname === `/system-design/${p.slug}`) || undefined}
            className="group border-t border-zinc-200 dark:border-zinc-800"
          >
            <summary className="flex cursor-pointer list-none gap-2 px-2 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span className="text-zinc-400 transition-transform group-open:rotate-90">▸</span>
              <span className="flex-1">{g.name}</span>
              <span className="font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                {g.items.filter((p) => p.done).length}/{g.items.length}
              </span>
            </summary>
            {g.items.map((p) => {
              const active = pathname === `/system-design/${p.slug}`;
              return (
                <Link
                  key={p.slug}
                  href={`/system-design/${p.slug}`}
                  className={`flex items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-sm ${
                    active
                      ? "bg-orange-50 font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-400"
                      : p.done
                        ? "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  }`}
                >
                  <span className="min-w-[22px] text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{p.id}</span>
                  <span className="flex-1">{p.name}</span>
                  <Badge done={p.done} short />
                </Link>
              );
            })}
          </details>
        ))}
      </nav>
    </aside>
  );
}

export function Badge({ done, short }: { done: boolean; short?: boolean }) {
  return done ? (
    <span className="whitespace-nowrap rounded-full bg-green-50 px-2 py-px text-[11px] font-semibold text-green-700 dark:bg-green-950/50 dark:text-green-400">
      {short ? "✓" : "Learned"}
    </span>
  ) : (
    <span className="whitespace-nowrap rounded-full border border-zinc-200 px-2 py-px text-[11px] font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      {short ? "Soon" : "Coming soon"}
    </span>
  );
}
