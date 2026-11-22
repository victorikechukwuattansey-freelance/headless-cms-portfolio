import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      throw new Error("JWT_SECRET must be set in production");
    }
    if (secret === "dev-secret" || secret.length < 32) {
      throw new Error(
        "JWT_SECRET must be at least 32 characters and must not be the development fallback in production",
      );
    }
    return secret;
  }
  return secret || "dev-secret";
})();

export function signAccessToken(userId: string, role: string) {
  return jwt.sign({ userId, role, type: "access" }, JWT_SECRET, {
    expiresIn: "15m",
  });
}

export function verifyAccessToken(token: string) {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
      type?: string;
    };
    if (payload.type && payload.type !== "access") return null;
    return { userId: payload.userId, role: payload.role };
  } catch (e: any) {
    if (e.name === "TokenExpiredError") return { expired: true as const };
    return null;
  }
}

export function generateRefreshToken() {
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashRefreshToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Keep signToken for backward compat (used in some resolvers)
export function signToken(userId: string, role: string) {
  return signAccessToken(userId, role);
}

export function verifyToken(token: string) {
  const result = verifyAccessToken(token);
  if (!result || "expired" in result) return null;
  return result;
}