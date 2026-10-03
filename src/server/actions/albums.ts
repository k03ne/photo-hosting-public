"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { newShareToken } from "@/lib/share-token";
import { slugify } from "@/lib/slug";
import { requireAdmin } from "@/server/current-admin";

export type AlbumFormState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[] | undefined>;
};

// Album-Grundeinstellungen. Veröffentlichung + Freigabe-URLs werden separat
// in der Freigabe-Kachel verwaltet (updateShareSettings).
const albumSchema = z.object({
  title: z.string().trim().min(1, "Titel ist erforderlich.").max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(60).optional(),
  layout: z.enum(["MASONRY", "GRID", "JUSTIFIED"]),
  columns: z.coerce.number().int().min(1).max(6),
  gridSpacing: z.enum(["REGULAR", "LARGE"]),
  coverBlurPx: z.coerce.number().int().min(0).max(40),
  coverOverlay: z.coerce.number().int().min(0).max(70),
  showExif: z.boolean(),
  headerTitlePos: z.enum(["TOP", "CENTER", "BOTTOM"]),
  headerAlign: z.enum(["LEFT", "CENTER", "RIGHT"]),
  // Legacy „DISPLAY" bleibt erlaubt (wird wie MODERN gerendert).
  headerFont: z.enum(["SANS", "SERIF", "MODERN", "TIMELESS", "BOLD", "SUBTLE", "DISPLAY"]),
  headerButton: z.enum(["UNDER", "BOTTOM", "HIDDEN"]),
  headerTextColor: z.string().trim().optional(),
  themeMode: z.enum(["AUTO", "LIGHT", "DARK"]),
  bgColor: z.string().trim().optional(),
});

/** Nur gültige 6-stellige Hex-Farben zulassen, sonst null. */
function normalizeHex(value: string | undefined): string | null {
  if (!value) return null;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

/** Erzeugt einen eindeutigen Slug, hängt bei Kollision -2, -3, … an. */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.album.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

function parseForm(formData: FormData) {
  return albumSchema.safeParse({
    title: formData.get("title"),
    description: (formData.get("description") as string) || undefined,
    category: (formData.get("category") as string) || undefined,
    layout: formData.get("layout"),
    columns: formData.get("columns"),
    gridSpacing: formData.get("gridSpacing") ?? "REGULAR",
    coverBlurPx: formData.get("coverBlurPx") ?? 0,
    coverOverlay: formData.get("coverOverlay") ?? 25,
    showExif: formData.get("showExif") === "on",
    headerTitlePos: formData.get("headerTitlePos") ?? "CENTER",
    headerAlign: formData.get("headerAlign") ?? "CENTER",
    headerFont: formData.get("headerFont") ?? "MODERN",
    headerButton: formData.get("headerButton") ?? "UNDER",
    headerTextColor: (formData.get("headerTextColor") as string) || undefined,
    themeMode: formData.get("themeMode") ?? "AUTO",
    bgColor: (formData.get("bgColor") as string) || undefined,
  });
}

export async function createAlbum(
  _prev: AlbumFormState,
  formData: FormData,
): Promise<AlbumFormState> {
  const admin = await requireAdmin();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const {
    title,
    description,
    layout,
    columns,
    coverBlurPx,
    coverOverlay,
    showExif,
  } = parsed.data;
  const slug = await uniqueSlug(slugify(title));

  // Neue Alben starten als Entwurf; Veröffentlichung erfolgt in der Freigabe.
  const album = await prisma.album.create({
    data: {
      title,
      description: description || null,
      layout,
      columns,
      isPublished: false,
      coverBlurPx,
      coverOverlay,
      showExif,
      slug,
      shareToken: newShareToken(),
      ownerId: admin.id,
    },
  });

  revalidatePath("/admin/albums");
  redirect(`/admin/albums/${album.id}`);
}

/**
 * Legt schnell ein Album nur mit Titel an (Standardwerte fürs Restliche) und
 * gibt id + Titel zurück — für den Upload-Flow in der Mediathek („Bilder"),
 * ohne Weiterleitung. Neue Alben starten als Entwurf.
 */
export async function createAlbumQuick(
  title: string,
): Promise<{ id: string; title: string }> {
  const admin = await requireAdmin();
  const t = title.trim().slice(0, 200);
  if (!t) throw new Error("Bitte einen Titel angeben.");
  const slug = await uniqueSlug(slugify(t));
  const album = await prisma.album.create({
    data: { title: t, slug, shareToken: newShareToken(), ownerId: admin.id },
    select: { id: true, title: true },
  });
  revalidatePath("/admin/albums");
  revalidatePath("/admin/bilder");
  return album;
}

export async function updateAlbum(
  _prev: AlbumFormState,
  formData: FormData,
): Promise<AlbumFormState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.album.findFirst({
    where: { id, ownerId: admin.id },
  });
  if (!existing) return { error: "Album nicht gefunden." };

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const {
    title,
    description,
    category,
    layout,
    columns,
    gridSpacing,
    coverBlurPx,
    coverOverlay,
    showExif,
    headerTitlePos,
    headerAlign,
    headerFont,
    headerButton,
    headerTextColor,
    themeMode,
    bgColor,
  } = parsed.data;
  // Slug/Veröffentlichung/Klartext-URL werden separat in der Freigabe verwaltet
  // und hier bewusst nicht angefasst.

  await prisma.album.update({
    where: { id },
    data: {
      title,
      description: description || null,
      category: category?.trim() || null,
      layout,
      columns,
      gridSpacing,
      coverBlurPx,
      coverOverlay,
      showExif,
      headerTitlePos,
      headerAlign,
      headerFont,
      headerButton,
      headerTextColor: normalizeHex(headerTextColor),
      themeMode,
      bgColor: normalizeHex(bgColor),
    },
  });

  revalidatePath("/admin/albums");
  revalidatePath(`/admin/albums/${id}`);
  return { success: true };
}

const shareSchema = z.object({
  slug: z.string().trim().min(1, "Link darf nicht leer sein.").max(120),
  isPublished: z.boolean(),
  readableUrl: z.boolean(),
});

/**
 * Freigabe-Einstellungen: Veröffentlichung, lesbare Klartext-URL an/aus und der
 * anpassbare Slug (bildet die lesbare Adresse `/a/<slug>`).
 */
export async function updateShareSettings(
  _prev: AlbumFormState,
  formData: FormData,
): Promise<AlbumFormState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.album.findFirst({
    where: { id, ownerId: admin.id },
    select: { id: true },
  });
  if (!existing) return { error: "Album nicht gefunden." };

  const parsed = shareSchema.safeParse({
    slug: formData.get("slug"),
    isPublished: formData.get("isPublished") === "on",
    readableUrl: formData.get("readableUrl") === "on",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const base = slugify(parsed.data.slug);
  if (!base) return { fieldErrors: { slug: ["Ungültiger Link."] } };
  const slug = await uniqueSlug(base, id);

  await prisma.album.update({
    where: { id },
    data: {
      slug,
      isPublished: parsed.data.isPublished,
      readableUrl: parsed.data.readableUrl,
    },
  });

  revalidatePath("/admin/albums");
  revalidatePath(`/admin/albums/${id}`);
  return { success: true };
}

/**
 * Erzeugt den kryptischen Freigabelink neu. Der alte Token wird damit
 * UNGÜLTIG — gedacht für den Fall, dass ein Link in falsche Hände geraten ist.
 *
 * Alben, die vor der Umstellung auf `newShareToken()` angelegt wurden, tragen
 * noch einen schwachen cuid-Token; hierüber lassen sie sich einzeln nachziehen.
 * Bewusst NICHT automatisch per Migration: das würde alle bereits verschickten
 * Gästelinks auf einen Schlag stillschweigend brechen.
 */
export async function rotateShareToken(
  _prev: AlbumFormState,
  formData: FormData,
): Promise<AlbumFormState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.album.findFirst({
    where: { id, ownerId: admin.id },
    select: { id: true },
  });
  if (!existing) return { error: "Album nicht gefunden." };

  await prisma.album.update({
    where: { id },
    data: { shareToken: newShareToken() },
  });

  revalidatePath("/admin/albums");
  revalidatePath(`/admin/albums/${id}`);
  return { success: true };
}

export async function deleteAlbum(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  // deleteMany mit ownerId => nur eigene Alben; Cascade löscht Fotos/Kommentare.
  await prisma.album.deleteMany({ where: { id, ownerId: admin.id } });

  revalidatePath("/admin/albums");
  redirect("/admin/albums");
}

const passwordSchema = z.object({
  password: z.string().min(4, "Mindestens 4 Zeichen.").max(200),
});

export async function setAlbumPassword(
  _prev: AlbumFormState,
  formData: FormData,
): Promise<AlbumFormState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const album = await prisma.album.findFirst({
    where: { id, ownerId: admin.id },
    select: { id: true },
  });
  if (!album) return { error: "Album nicht gefunden." };

  const parsed = passwordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.album.update({
    where: { id },
    data: { passwordHash, passwordSetAt: new Date() },
  });

  revalidatePath(`/admin/albums/${id}`);
  return { success: true };
}

export async function removeAlbumPassword(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  await prisma.album.updateMany({
    where: { id, ownerId: admin.id },
    data: { passwordHash: null, passwordSetAt: null },
  });

  revalidatePath(`/admin/albums/${id}`);
}
