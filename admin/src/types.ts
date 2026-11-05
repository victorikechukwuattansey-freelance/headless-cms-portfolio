export type Status = "DRAFT" | "PUBLISHED";

export type Post = {
  id: string;
  title: string;
  slug: string;
  content: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  defaultLocale: string;
  author: { email: string };
  heroMedia: { id: string; url: string; alt: string | null } | null;
  translations: {
    locale: string;
    title: string;
    slug: string;
    content: string;
  }[];
};