import Link from "next/link";
import { getPublishedPosts, searchPosts, API_URL, mediaUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; lang?: string }>;
}) {
  const { q, lang } = await searchParams;
  const locale = lang ?? undefined;
  const posts = q ? await searchPosts(q, locale) : await getPublishedPosts(locale);

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
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, color: "#111827" }}>Blog</h1>
        <p style={{ color: "#6b7280", marginTop: 4 }}>
          Powered by the headless CMS at{" "}
          <a href={`${API_URL}/graphql`} style={{ color: "#4f46e5" }}>
            {API_URL}
          </a>
        </p>
      </header>

      <nav style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {[
          { code: "en", label: "English" },
          { code: "fr", label: "Français" },
          { code: "es", label: "Español" },
        ].map((l) => {
          const active = (lang ?? "en") === l.code;
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (l.code !== "en") params.set("lang", l.code);
          const query = params.toString();
          const href = query ? `/?${query}` : "/";
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

      <form method="get" style={{ marginBottom: 24, display: "flex", gap: 8 }}>
        {lang && <input type="hidden" name="lang" value={lang} />}
        <input
          type="search"
          name="q"
          placeholder="Search posts…"
          defaultValue={q ?? ""}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 14,
            color: "#111827",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "8px 16px",
            background: "#4f46e5",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Search
        </button>
      </form>

      {posts.length === 0 && (
        <p>{q ? `No results for "${q}".` : "No published posts yet."}</p>
      )}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {posts.map((p) => {
          const postHref = lang
            ? `/posts/${p.slug}?lang=${lang}`
            : `/posts/${p.slug}`;

          return (
            <li
              key={p.id}
              style={{
                marginBottom: 32,
                paddingBottom: 24,
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              {p.heroMedia && (
                <img
                  src={mediaUrl(p.heroMedia.url)}
                  alt={p.heroMedia.alt ?? p.title}
                  style={{
                    maxWidth: "100%",
                    borderRadius: 8,
                    marginBottom: 12,
                    display: "block",
                  }}
                />
              )}
              <h2 style={{ margin: "0 0 8px" }}>
                <Link
                  href={postHref}
                  style={{ color: "#111827", textDecoration: "none" }}
                >
                  {p.title}
                </Link>
                {p.isFallback && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "#92400e",
                      background: "#fef3c7",
                      padding: "2px 6px",
                      borderRadius: 4,
                      marginLeft: 8,
                      verticalAlign: "middle",
                      fontWeight: 600,
                    }}
                  >
                    EN fallback
                  </span>
                )}
              </h2>
              <p style={{ color: "#6b7280", margin: 0, fontSize: 14 }}>
                By {p.author.email}
                {p.publishedAt &&
                  ` · ${new Date(p.publishedAt).toLocaleDateString()}`}
              </p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}