"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { mediaUrl } from "@/lib/media";
import {
  addComment,
  getComments,
  type GuestComment,
} from "@/server/actions/interactions";

export function CommentModal({
  photo,
  onClose,
  onAdded,
}: {
  photo: { id: string; storageKey: string; caption: string | null };
  onClose: () => void;
  onAdded: () => void;
}) {
  const [comments, setComments] = useState<GuestComment[] | null>(null);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getComments(photo.id).then(setComments).catch(() => setComments([]));
    const saved = localStorage.getItem("guestName");
    if (saved) setName(saved);
  }, [photo.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    setError(null);
    try {
      const created = await addComment({
        photoId: photo.id,
        body,
        guestName: name || undefined,
      });
      setComments((prev) => [...(prev ?? []), created]);
      setBody("");
      if (name) localStorage.setItem("guestName", name);
      onAdded();
    } catch {
      setError("Kommentar konnte nicht gesendet werden.");
    } finally {
      setPending(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-neutral-900"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(photo.storageKey, "thumb")}
          alt={photo.caption ?? ""}
          className="max-h-40 w-full bg-neutral-100 object-contain dark:bg-neutral-800"
        />

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <h2 className="text-sm font-medium text-neutral-500">Kommentare</h2>
          {comments === null ? (
            <div className="space-y-2">
              <div className="h-10 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="h-10 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-neutral-400">
              Noch keine Kommentare. Sei die/der Erste!
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium">{c.guestName}</span>{" "}
                  <span className="text-xs text-neutral-400">
                    {new Date(c.createdAt).toLocaleDateString("de-DE")}
                  </span>
                  <p className="text-neutral-600 dark:text-neutral-300">
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={submit}
          className="space-y-2 border-t border-neutral-200 p-4 dark:border-neutral-800"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dein Name (optional)"
            maxLength={60}
            className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
          />
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Kommentar schreiben…"
              maxLength={1000}
              className="flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
            />
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {pending ? "…" : "Senden"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      </motion.div>
    </motion.div>
  );
}
