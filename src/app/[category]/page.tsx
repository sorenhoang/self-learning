import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildContentTree, getCategoryReadme } from "@/lib/content";
import { markdownToHtml } from "@/lib/markdown";
import BookCard from "@/components/content/BookCard";
import PostCard from "@/components/content/PostCard";
import Link from "next/link";

interface PageProps {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  const tree = buildContentTree();
  return tree.categories.map((cat) => ({ category: cat.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const tree = buildContentTree();
  const cat = tree.categories.find((c) => c.slug === category);
  if (!cat) return {};
  const ogUrl = `/api/og?title=${encodeURIComponent(cat.title)}&type=category`;
  return {
    title: cat.title,
    description: cat.description,
    openGraph: { images: [{ url: ogUrl, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image" },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  const tree = buildContentTree();
  const cat = tree.categories.find((c) => c.slug === category);
  if (!cat) notFound();

  const { content } = getCategoryReadme(category);
  const introHtml = await markdownToHtml(content);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-8 flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/" className="hover:text-zinc-600 dark:hover:text-zinc-200">
          Home
        </Link>
        <span>/</span>
        <span className="text-zinc-700 dark:text-zinc-300">{cat.title}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {cat.title}
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">{cat.description}</p>
        {content.trim() && (
          <div
            className="prose prose-zinc mt-4 max-w-2xl text-sm dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: introHtml }}
          />
        )}
      </div>

      {/* Books / Series */}
      {cat.books.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Series
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cat.books.map((book) => (
              <BookCard key={book.slug} book={book} />
            ))}
          </div>
        </section>
      )}

      {/* Standalone Posts */}
      {cat.posts.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Posts
          </h2>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[...cat.posts]
              .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
              .map((post) => (
                <PostCard key={post.slug} post={post} variant="list" />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
