const ACCESS_KEY = "cms_access_token";
const REFRESH_KEY = "cms_refresh_token";
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// Backwards compat for existing imports
export const getToken = getAccessToken;
export function setToken(token: string | null) {
  if (token) localStorage.setItem(ACCESS_KEY, token);
  else localStorage.removeItem(ACCESS_KEY);
}

type GqlOptions = { skipAuthRetry?: boolean };

export async function gql<T = any>(
  query: string,
  variables: Record<string, any> = {},
  opts: GqlOptions = {}
): Promise<T> {
  const accessToken = getAccessToken();

  const res = await fetch(`${API_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();

  // If the token is expired and we have a refresh token, try once more
  const expired =
    json.errors?.some(
      (e: any) => e.extensions?.code === "TOKEN_EXPIRED"
    );

  if (expired && !opts.skipAuthRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return gql<T>(query, variables, { skipAuthRetry: true });
    }
    clearTokens();
    window.location.reload();
    throw new Error("Session expired. Please log in again.");
  }

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return json.data as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `mutation($rt:String!) {
          refreshSession(refreshToken:$rt) {
            accessToken refreshToken
          }
        }`,
        variables: { rt: refreshToken },
      }),
    });
    const json = await res.json();
    if (json.errors?.length) return false;
    const { accessToken, refreshToken: newRt } = json.data.refreshSession;
    setTokens(accessToken, newRt);
    return true;
  } catch {
    return false;
  }
}