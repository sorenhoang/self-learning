import Link from "next/link";
import type { PostMeta } from "@/types/content";
import { formatDate } from "@/lib/date";

interface PostCardProps {
  post: PostMeta;
  variant?: "card" | "list";
}

export default function PostCard({ post, variant = "card" }: PostCardProps) {
  const href = `/${post.category}/${post.slug}`;

  if (variant === "list") {
    return (
      <Link
        href={href}
        className="group flex items-start gap-4 py-4 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        <span className="w-28 shrink-0 text-xs text-zinc-400 pt-0.5">
          {post.date ? formatDate(post.date) : ""}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-900 group-hover:text-zinc-600 dark:text-zinc-100 dark:group-hover:text-zinc-300">
            {post.title}
          </p>
          {post.description && (
            <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500 dark:text-zinc-400">
              {post.description}
            </p>
          )}
        </div>
        <div className="hidden shrink-0 flex-wrap items-center gap-1.5 sm:flex">
          {post.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group block rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <h3 className="mb-1.5 font-semibold text-zinc-900 group-hover:text-zinc-600 dark:text-zinc-100 dark:group-hover:text-zinc-300">
        {post.title}
      </h3>
      {post.description && (
        <p className="mb-3 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
          {post.description}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {post.date && (
          <span className="text-xs text-zinc-400">
            {formatDate(post.date)}
          </span>
        )}
        {post.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          >
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
