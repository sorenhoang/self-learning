import Link from "next/link";
import type { Metadata } from "next";
import { getSystemDesign } from "@/lib/system-design";
import { Badge } from "@/components/system-design/Sidebar";

export const metadata: Metadata = { title: "System Design" };

export default function SystemDesignPage() {
  const { title, groups, all } = getSystemDesign();
  const learned = all.filter((p) => p.done).length;

  return (
    <>
      <h1 className="mb-2 text-[34px] font-bold leading-tight tracking-tight">{title}</h1>
      <p className="mb-10 text-zinc-500 dark:text-zinc-400">
        {all.length} problems in {groups.length} groups · {learned} learned
      </p>
      {groups.map((g) => (
        <section key={g.name} className="mb-11">
          <h2 className="text-xl font-bold">
            {g.name}{" "}
            <span className="text-base font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
              {g.items.filter((p) => p.done).length}/{g.items.length}
            </span>
          </h2>
          <p className="mb-4 mt-1 text-zinc-500 dark:text-zinc-400">{g.description}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {g.items.map((p) => (
              <Link
                key={p.slug}
                href={`/system-design/${p.slug}`}
                className="flex flex-col items-start gap-1.5 rounded-[10px] border border-zinc-200 bg-white p-3.5 hover:border-orange-600 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-orange-400"
              >
                <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">#{p.id}</span>
                <b className="text-[15px]">{p.name}</b>
                <Badge done={p.done} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
