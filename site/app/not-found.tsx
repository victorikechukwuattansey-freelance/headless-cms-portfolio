import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        maxWidth: 480,
        margin: "80px auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "#111827",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 48, margin: 0 }}>404</h1>
      <p style={{ color: "#6b7280" }}>This page doesn't exist.</p>
      <Link href="/" style={{ color: "#4f46e5" }}>
        Back to home
      </Link>
    </main>
  );
}