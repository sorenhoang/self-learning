"use client";

import { useState } from "react";
import PostCard from "./PostCard";
import type { PostMeta } from "@/types/content";

const PER_PAGE = 10;

export default function PostList({ posts }: { posts: PostMeta[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(posts.length / PER_PAGE);
  const slice = posts.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {slice.map((post) => (
          <PostCard key={post.slug} post={post} variant="list" />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800"
          >
            ← Previous
          </button>
          <span>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page === totalPages - 1}
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
