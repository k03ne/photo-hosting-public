"use client";

import { useState, useTransition } from "react";

import { mediaUrl } from "@/lib/media";
import {
  deleteComment,
  toggleCommentHidden,
} from "@/server/actions/moderation";

type ModComment = {
  id: string;
  body: string;
  guestName: string | null;
  isHidden: boolean;
  createdAt: Date;
  photo: { storageKey: string } | null;
};

export function CommentModeration({ comments: initial }: { comments: ModComment[] }) {
  const [comments, setComments] = useState(initial);
  const [, startTransition] = useTransition();

  if (comments.length === 0) {
    return <p className="text-sm text-neutral-400">Noch keine Kommentare.</p>;
  }

  function toggle(id: string, current: boolean) {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isHidden: !current } : c)),
    );
    startTransition(() => toggleCommentHidden(id));
  }

  function remove(id: string) {
    if (!confirm("Kommentar löschen?")) return;
    setComments((prev) => prev.filter((c) => c.id !== id));
    startTransition(() => deleteComment(id));
  }

  return (
    <ul className="space-y-2">
      {comments.map((c) => (
        <li
          key={c.id}
          className={`flex items-start gap-3 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800 ${
            c.isHidden ? "opacity-50" : ""
          }`}
        >
          {c.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl(c.photo.storageKey, "thumb")}
              alt=""
              className="h-10 w-10 shrink-0 rounded object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p>
              <span className="font-medium">{c.guestName ?? "Gast"}</span>{" "}
              <span className="text-xs text-neutral-400">
                {new Date(c.createdAt).toLocaleDateString("de-DE")}
                {c.isHidden && " · ausgeblendet"}
              </span>
            </p>
            <p className="break-words text-neutral-600 dark:text-neutral-300">
              {c.body}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => toggle(c.id, c.isHidden)}
              className="text-xs text-neutral-500 underline-offset-2 hover:underline"
            >
              {c.isHidden ? "Einblenden" : "Ausblenden"}
            </button>
            <button
              onClick={() => remove(c.id)}
              className="text-xs text-red-600 underline-offset-2 hover:underline"
            >
              Löschen
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
