export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Post = {
  id: string;
  title: string;
  slug: string;
  content: string;
  publishedAt: string | null;
  locale: string;
  isFallback: boolean;
  author: { email: string };
  heroMedia: { url: string; alt: string | null } | null;
};

async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${API_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

export async function getPublishedPosts(locale?: string): Promise<Post[]> {
  const data = await gql<{ posts: Post[] }>(
    `query($locale: String) {
      posts(publishedOnly: true, locale: $locale) {
        id title slug content publishedAt locale isFallback
        author { email }
        heroMedia { url alt }
      }
    }`,
    { locale: locale ?? null },
  );
  return data.posts;
}

export async function getPostBySlug(
  slug: string,
  locale?: string,
): Promise<Post | null> {
  const data = await gql<{ post: Post | null }>(
    `query($slug: String!, $locale: String) {
      post(slug: $slug, locale: $locale) {
        id title slug content publishedAt locale isFallback
        author { email }
        heroMedia { url alt }
      }
    }`,
    { slug, locale: locale ?? null },
  );
  return data.post;
}

export async function searchPosts(
  query: string,
  locale?: string,
): Promise<Post[]> {
  const data = await gql<{ searchPosts: Post[] }>(
    `query($q: String!, $locale: String) {
      searchPosts(query: $q, locale: $locale) {
        id title slug content publishedAt locale isFallback
        author { email }
        heroMedia { url alt }
      }
    }`,
    { q: query, locale: locale ?? null },
  );
  return data.searchPosts;
}

export function mediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_URL}${url}`;
}
