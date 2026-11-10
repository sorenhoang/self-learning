import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSystemDesign, getProblemContent } from "@/lib/system-design";
import { markdownToHtml } from "@/lib/markdown";
import MarkdownRenderer from "@/components/content/MarkdownRenderer";
import { Badge } from "@/components/system-design/Sidebar";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getSystemDesign().all.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const problem = getSystemDesign().all.find((p) => p.slug === slug);
  return problem ? { title: problem.name } : {};
}

export default async function ProblemPage({ params }: PageProps) {
  const { slug } = await params;
  const { groups, all } = getSystemDesign();
  const problem = all.find((p) => p.slug === slug);
  if (!problem) notFound();

  const content = getProblemContent(slug);

  return (
    <>
      <Link href="/system-design" className="mb-2.5 inline-block text-sm text-zinc-500 hover:text-orange-600 dark:text-zinc-400">
        ← {groups[problem.gi].name}
      </Link>
      <h1 className="mb-2 text-[34px] font-bold leading-tight tracking-tight">
        #{problem.id} {problem.name}
      </h1>
      <Badge done={problem.done} />
      <div className="mt-6">
        {content !== null ? (
          <MarkdownRenderer html={await markdownToHtml(content)} />
        ) : (
          <div className="mt-7 rounded-xl border border-dashed border-zinc-200 bg-white p-10 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <strong className="mb-1 block text-[22px] text-zinc-900 dark:text-zinc-100">Coming soon</strong>
            This problem hasn&apos;t been learned yet.
          </div>
        )}
      </div>
    </>
  );
}
