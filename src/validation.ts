import { z } from "zod";
import { UserError } from "./errors.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(slugPattern, "Slug must be lowercase, alphanumeric, dashes only").max(200).optional(),
  content: z.string().min(1),
  heroMediaId: z.string().optional().nullable(),
});

export const updatePostSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().regex(slugPattern, "Slug must be lowercase, alphanumeric, dashes only").max(200).optional(),
  content: z.string().min(1).optional(),
  heroMediaId: z.string().optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const translationSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(slugPattern, 
  "Slug must be lowercase, alphanumeric, dashes only").max(200),
  content: z.string().min(1),
});

const localePattern = /^[a-z]{2}(-[A-Z]{2})?$/;

export const localeSchema = z.string().regex(localePattern, 
  "Locale must be like en or en-US");

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new UserError(
      `${first.path.join(".") || "input"}: ${first.message}`,
      "BAD_USER_INPUT"
    );
  }
  return result.data;
}