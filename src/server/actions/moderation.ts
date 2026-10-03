"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/current-admin";

/** Kommentar, der zu einem Album des Admins gehört (über das Foto). */
async function ownedComment(commentId: string, adminId: string) {
  return prisma.comment.findFirst({
    where: { id: commentId, photo: { album: { ownerId: adminId } } },
    select: { id: true, isHidden: true, photo: { select: { albumId: true } } },
  });
}

export async function toggleCommentHidden(commentId: string): Promise<void> {
  const admin = await requireAdmin();
  const comment = await ownedComment(commentId, admin.id);
  if (!comment) throw new Error("Kommentar nicht gefunden.");

  await prisma.comment.update({
    where: { id: commentId },
    data: { isHidden: !comment.isHidden },
  });
  if (comment.photo) {
    revalidatePath(`/admin/albums/${comment.photo.albumId}`);
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  const admin = await requireAdmin();
  const comment = await ownedComment(commentId, admin.id);
  if (!comment) throw new Error("Kommentar nicht gefunden.");

  await prisma.comment.delete({ where: { id: commentId } });
  if (comment.photo) {
    revalidatePath(`/admin/albums/${comment.photo.albumId}`);
  }
}
