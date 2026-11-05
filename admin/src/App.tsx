import { useEffect, useState } from "react";
import {
  gql,
  getToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from "./api";
import type { Post } from "./types";

const PAGE_SIZE = 24;
const POSTS_QUERY = `
  query {
    posts(publishedOnly: false) {
      id
      title
      slug
      content
      status
      publishedAt
      defaultLocale
      author { email }
      heroMedia { id url alt }
      translations { locale title slug content }
    }
  }
`;

type Draft = {
  id?: string;
  title: string;
  slug: string;
  content: string;
};

const emptyDraft: Draft = { title: "", slug: "", content: "" };

type LibraryItem = {
  id: string;
  url: string;
  alt: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
};

function thumbUrl(url: string, w = 200, h = 200): string {
  if (!url.includes("res.cloudinary.com")) return url;
  return url.replace(
    "/image/upload/",
    `/image/upload/w_${w},h_${h},c_fill,q_auto,f_auto/`,
  );
}

export default function App() {
  const [locale, setLocale] = useState<string>("en");
  const [token, setTok] = useState<string | null>(getToken());
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heroMediaId, setHeroMediaId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryHasMore, setLibraryHasMore] = useState(true);

  async function loadPosts() {
    try {
      const data = await gql<{ posts: Post[] }>(POSTS_QUERY);
      setPosts(data.posts);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function loadLibrary(reset = false) {
    const offset = reset ? 0 : library.length;
    try {
      const data = await gql<{ media: LibraryItem[] }>(
        `query($limit:Int!, $offset:Int!) {
        media(limit:$limit, offset:$offset) {
          id url alt mimeType size createdAt
        }
      }`,
        { limit: PAGE_SIZE, offset },
      );
      setLibrary(reset ? data.media : [...library, ...data.media]);
      setLibraryHasMore(data.media.length === PAGE_SIZE);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function openLibrary() {
    setShowLibrary(true);
    loadLibrary(true);
  }

  async function removeMedia(id: string) {
    if (!confirm("Delete this media item? This cannot be undone.")) return;
    try {
      await gql(`mutation($id:ID!){ deleteMedia(id:$id) }`, { id });
      await loadLibrary(true);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function editAlt(m: LibraryItem) {
    const current = m.alt ?? "";
    const next = prompt("Alt text (leave blank to clear):", current);
    if (next === null) return; // cancelled

    try {
      await gql(
        `mutation($id:ID!, $alt:String) {
        updateMedia(id:$id, alt:$alt) { id alt }
      }`,
        { id: m.id, alt: next.trim() || null },
      );
      await loadLibrary(true);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function selectMedia(m: { id: string }) {
    setHeroMediaId(m.id);
    setShowLibrary(false);
  }

  async function login() {
  try {
    const data = await gql<{
      login: { accessToken: string; refreshToken: string };
    }>(
      `mutation($email:String!,$password:String!) {
        login(email:$email, password:$password) {
          accessToken
          refreshToken
        }
      }`,
      { email, password }
    );
    setTokens(data.login.accessToken, data.login.refreshToken);
    setTok(data.login.accessToken);
    setError(null);
  } catch (e: any) {
    setError(e.message);
  }
}

  async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await gql(
        `mutation($rt:String!){ logout(refreshToken:$rt) }`,
        { rt: refreshToken }
      );
    } catch {
      // Ignore — we're logging out anyway
    }
  }
  clearTokens();
  setTok(null);
  setPosts([]);
}

  useEffect(() => {
    if (token) loadPosts();
  }, [token]);

  // Reload draft fields when locale changes (or a post is opened for edit)
  useEffect(() => {
    if (!draft?.id) return;
    const post = posts.find((p) => p.id === draft.id);
    if (!post) return;

    if (locale === post.defaultLocale) {
      setDraft({
        id: post.id,
        title: post.title,
        slug: post.slug,
        content: post.content,
      });
    } else {
      const t = post.translations.find((t) => t.locale === locale);
      setDraft({
        id: post.id,
        title: t?.title ?? "",
        slug: t?.slug ?? "",
        content: t?.content ?? "",
      });
    }
  }, [locale, draft?.id]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const sig = await gql<{
        createUploadSignature: {
          timestamp: number;
          signature: string;
          apiKey: string;
          cloudName: string;
          folder: string;
        };
      }>(
        `mutation {
          createUploadSignature {
            timestamp signature apiKey cloudName folder
          }
        }`,
      );

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", sig.createUploadSignature.apiKey);
      formData.append("timestamp", String(sig.createUploadSignature.timestamp));
      formData.append("signature", sig.createUploadSignature.signature);
      formData.append("folder", sig.createUploadSignature.folder);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.createUploadSignature.cloudName}/image/upload`,
        { method: "POST", body: formData },
      );
      if (!uploadRes.ok) throw new Error("Cloudinary upload failed");
      const { secure_url, bytes, format } = await uploadRes.json();

      const mediaData = await gql<{ createMedia: { id: string } }>(
        `mutation($url:String!, $mimeType:String, $size:Int) {
          createMedia(url:$url, mimeType:$mimeType, size:$size) { id }
        }`,
        { url: secure_url, mimeType: `image/${format}`, size: bytes },
      );

      setHeroMediaId(mediaData.createMedia.id);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    try {
      const post = posts.find((p) => p.id === draft.id);
      const isDefault = !post || locale === post.defaultLocale;

      if (draft.id && isDefault) {
        await gql(
          `mutation($id:ID!,$input:UpdateBlogPostInput!) {
            updatePost(id:$id, input:$input) { id }
          }`,
          {
            id: draft.id,
            input: {
              title: draft.title,
              slug: draft.slug,
              content: draft.content,
              heroMediaId,
            },
          },
        );
      } else if (draft.id) {
        await gql(
          `mutation($postId:ID!, $locale:String!, $title:String!, $slug:String!, $content:String!) {
            upsertTranslation(postId:$postId, locale:$locale, title:$title, slug:$slug, content:$content) { id }
          }`,
          {
            postId: draft.id,
            locale,
            title: draft.title,
            slug: draft.slug,
            content: draft.content,
          },
        );
      } else {
        await gql(
          `mutation($input:CreateBlogPostInput!) {
            createPost(input:$input) { id }
          }`,
          {
            input: {
              title: draft.title,
              slug: draft.slug,
              content: draft.content,
              heroMediaId,
            },
          },
        );
      }

      setDraft(null);
      setHeroMediaId(null);
      setError(null);
      await loadPosts();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function deleteTranslation() {
    if (!draft?.id) return;
    const post = posts.find((p) => p.id === draft.id);
    if (!post) return;
    if (locale === post.defaultLocale) return;

    const hasTranslation = post.translations.some((t) => t.locale === locale);
    if (!hasTranslation) return;

    if (!confirm(`Delete the ${locale} translation? This cannot be undone.`))
      return;

    try {
      await gql(
        `mutation($postId:ID!, $locale:String!) {
        deleteTranslation(postId:$postId, locale:$locale)
      }`,
        { postId: draft.id, locale },
      );
      await loadPosts();
      setDraft(null);
      setHeroMediaId(null);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function togglePublish(post: Post) {
    const mutation =
      post.status === "PUBLISHED" ? "unpublishPost" : "publishPost";
    try {
      await gql(`mutation($id:ID!){ ${mutation}(id:$id) { id } }`, {
        id: post.id,
      });
      await loadPosts();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removePost(post: Post) {
    if (!confirm(`Delete "${post.title}"?`)) return;
    try {
      await gql(`mutation($id:ID!){ deletePost(id:$id) }`, { id: post.id });
      await loadPosts();
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (!token) {
    return (
      <div style={styles.container}>
        <h1>CMS Admin — Login</h1>
        <div style={styles.form}>
          <input
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
          />
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
          />
          <button style={styles.btnPrimary} onClick={login}>
            Login
          </button>
          {error && <div style={styles.error}>{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={{ margin: 0, color: "#111827" }}>CMS Admin</h1>
        <div>
          <button style={styles.btn} onClick={loadPosts}>
            Refresh
          </button>
          <button
            style={styles.btn}
            onClick={() => {
              setLocale("en");
              setDraft(emptyDraft);
              setHeroMediaId(null);
            }}
          >
            New Post
          </button>
          <button style={styles.btn} onClick={openLibrary}>
            Media Library
          </button>
          <button style={styles.btn} onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      {draft && (
        <section style={styles.card}>
          <h2>{draft.id ? "Edit Post" : "New Post"}</h2>

          {draft.id && (
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 13 }}
              >
                Editing locale
              </label>
              <select
                style={styles.input}
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              >
                <option value="en">English (default)</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
              </select>
              {(() => {
                const post = posts.find((p) => p.id === draft.id);
                if (!post) return null;
                if (locale === post.defaultLocale) {
                  return (
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Editing default ({post.defaultLocale}) content.
                    </div>
                  );
                }
                const hasTranslation = post.translations.some(
                  (t) => t.locale === locale,
                );
                return hasTranslation ? (
                  <div style={{ fontSize: 12, color: "#065f46" }}>
                    Editing existing {locale} translation.
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#92400e" }}>
                    No {locale} translation yet — save to create one.
                  </div>
                );
              })()}
            </div>
          )}

          <input
            style={styles.input}
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <input
            style={styles.input}
            placeholder="Slug"
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          />
          <textarea
            style={{ ...styles.input, height: 160, fontFamily: "inherit" }}
            placeholder="Content"
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          />

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
              Hero image
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={uploading}
              />
              <button
                type="button"
                style={styles.btn}
                onClick={openLibrary}
                disabled={!draft.id}
                title={
                  draft.id ? "" : "Save the post first to attach from library"
                }
              >
                Pick from Library
              </button>
            </div>
            {uploading && <div style={{ fontSize: 12 }}>Uploading…</div>}
            {heroMediaId && (
              <div style={{ fontSize: 12, color: "#065f46" }}>
                Image attached.
              </div>
            )}
          </div>

          <div>
            <button style={styles.btnPrimary} onClick={saveDraft}>
              Save
            </button>
            <button
              style={styles.btn}
              onClick={() => {
                setDraft(null);
                setHeroMediaId(null);
              }}
            >
              Cancel
            </button>
            {draft.id &&
              locale !== "en" &&
              posts
                .find((p) => p.id === draft.id)
                ?.translations.some((t) => t.locale === locale) && (
                <button
                  style={{ ...styles.btn, color: "#b91c1c" }}
                  onClick={deleteTranslation}
                >
                  Delete {locale} translation
                </button>
              )}
          </div>
        </section>
      )}

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Title</th>
            <th style={styles.th}>Slug</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Locales</th>
            <th style={styles.th}>Author</th>
            <th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.id}>
              <td style={styles.td}>{p.title}</td>
              <td style={styles.td}>{p.slug}</td>
              <td style={styles.td}>
                <span
                  style={{
                    ...styles.badge,
                    background:
                      p.status === "PUBLISHED" ? "#d1fae5" : "#fef3c7",
                    color: p.status === "PUBLISHED" ? "#065f46" : "#92400e",
                  }}
                >
                  {p.status}
                </span>
              </td>
              <td style={styles.td}>
                <span style={styles.badge}>{p.defaultLocale}</span>
                {p.translations.map((t) => (
                  <span
                    key={t.locale}
                    style={{
                      ...styles.badge,
                      marginLeft: 4,
                      background: "#e0e7ff",
                      color: "#3730a3",
                    }}
                  >
                    {t.locale}
                  </span>
                ))}
              </td>
              <td style={styles.td}>{p.author.email}</td>
              <td style={styles.td}>
                <button
                  style={styles.btn}
                  onClick={() => {
                    setLocale(p.defaultLocale);
                    setDraft({
                      id: p.id,
                      title: p.title,
                      slug: p.slug,
                      content: p.content,
                    });
                    setHeroMediaId(p.heroMedia?.id ?? null);
                  }}
                >
                  Edit
                </button>
                <button style={styles.btn} onClick={() => togglePublish(p)}>
                  {p.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                </button>
                <button
                  style={{ ...styles.btn, color: "#b91c1c" }}
                  onClick={() => removePost(p)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {posts.length === 0 && (
            <tr>
              <td style={styles.td} colSpan={6}>
                No posts yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showLibrary && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setShowLibrary(false)}
        >
          <div
            style={{
              background: "#fff",
              color: "#111827",
              padding: 24,
              borderRadius: 8,
              maxWidth: 900,
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h2 style={{ margin: 0 }}>Media Library</h2>
              <button style={styles.btn} onClick={() => setShowLibrary(false)}>
                Close
              </button>
            </div>

            {library.length === 0 && (
              <p style={{ color: "#6b7280" }}>No media uploaded yet.</p>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              {library.map((m) => (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <img
                    src={thumbUrl(m.url)}
                    alt={m.alt ?? ""}
                    style={{
                      width: "100%",
                      height: 100,
                      objectFit: "cover",
                      borderRadius: 4,
                      background: "#f3f4f6",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      wordBreak: "break-all",
                    }}
                  >
                    {m.id.slice(0, 8)}…
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {draft?.id && (
                      <button
                        style={{ ...styles.btn, flex: 1, fontSize: 11 }}
                        onClick={() => selectMedia(m)}
                      >
                        Use
                      </button>
                    )}
                    <button
                      style={{ ...styles.btn, fontSize: 11 }}
                      onClick={() => editAlt(m)}
                    >
                      Alt
                    </button>
                    <button
                      style={{ ...styles.btn, fontSize: 11, color: "#b91c1c" }}
                      onClick={() => removeMedia(m.id)}
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {libraryHasMore && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  style={styles.btnPrimary}
                  onClick={() => loadLibrary(false)}
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1000,
    margin: "40px auto",
    padding: 24,
    fontFamily: "system-ui, sans-serif",
    color: "#111827",
    background: "#fff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    background: "#fff",
  },
  form: { display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 },
  input: {
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    marginBottom: 8,
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    color: "#111827",
    colorScheme: "light",
  },
  btn: {
    padding: "6px 12px",
    marginRight: 6,
    border: "1px solid #d1d5db",
    borderRadius: 6,
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
    fontSize: 13,
  },
  btnPrimary: {
    padding: "8px 16px",
    marginRight: 6,
    border: "none",
    borderRadius: 6,
    background: "#4f46e5",
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#fff",
    color: "#111827",
  },
  th: {
    textAlign: "left",
    padding: 10,
    borderBottom: "2px solid #e5e7eb",
    fontSize: 13,
    color: "#374151",
  },
  td: {
    padding: 10,
    borderBottom: "1px solid #f3f4f6",
    fontSize: 13,
    color: "#111827",
  },
  badge: {
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    background: "#d1fae5",
    color: "#065f46",
    display: "inline-block",
  },
  error: {
    color: "#991b1b",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 6,
    padding: "8px 12px",
    marginBottom: 16,
    fontSize: 13,
  },
};
