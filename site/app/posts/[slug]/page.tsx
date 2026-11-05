import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostBySlug, API_URL, mediaUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const post = await getPostBySlug(slug, lang ?? undefined);
  if (!post) notFound();

  const currentLang = lang ?? "en";

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "40px auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "#111827",
      }}
    >
      <p style={{ marginBottom: 8 }}>
        <Link
          href={lang ? `/?lang=${lang}` : "/"}
          style={{ color: "#4f46e5", textDecoration: "none" }}
        >
          ← Back
        </Link>
      </p>

      <nav style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { code: "en", label: "English" },
          { code: "fr", label: "Français" },
          { code: "es", label: "Español" },
        ].map((l) => {
          const active = currentLang === l.code;
          const href =
            l.code === "en"
              ? `/posts/${slug}`
              : `/posts/${slug}?lang=${l.code}`;
          return (
            <a
              key={l.code}
              href={href}
              style={{
                color: active ? "#4f46e5" : "#6b7280",
                fontWeight: active ? 600 : 400,
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              {l.label}
            </a>
          );
        })}
      </nav>

      <h1 style={{ marginBottom: 8 }}>
        {post.title}
        {post.isFallback && (
          <span
            style={{
              fontSize: 12,
              color: "#92400e",
              background: "#fef3c7",
              padding: "2px 8px",
              borderRadius: 4,
              marginLeft: 12,
              verticalAlign: "middle",
              fontWeight: 600,
            }}
          >
            EN fallback
          </span>
        )}
      </h1>

      <p style={{ color: "#6b7280", fontSize: 14 }}>
        By {post.author.email}
        {post.publishedAt &&
          ` · ${new Date(post.publishedAt).toLocaleDateString()}`}
      </p>

      {post.heroMedia && (
        <img
          src={mediaUrl(post.heroMedia.url)}
          alt={post.heroMedia.alt ?? post.title}
          style={{
            maxWidth: "100%",
            borderRadius: 8,
            margin: "16px 0",
            display: "block",
          }}
        />
      )}

      <article
        style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 16 }}
      >
        {post.content}
      </article>
    </main>
  );
}