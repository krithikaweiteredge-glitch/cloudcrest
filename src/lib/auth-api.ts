// Single source of truth for auth: the backend `auth_token` httpOnly cookie.
// Nothing about the session is mirrored in localStorage — the cookie can't be read
// from JS, so the current user is always resolved by asking the server.

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

export type AuthUser = {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  roleId: number | null;
  roleName: string | null;
  status: string | null;
  createdAt: string;
};

async function postJson(path: string, body?: unknown) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

/** Resolve the signed-in user from the session cookie. Returns null when signed out. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.user as AuthUser) ?? null;
  } catch {
    return null;
  }
}

/** Clear the session cookie server-side. */
export async function logout(): Promise<void> {
  try {
    await postJson("/api/auth/logout");
  } catch {
    /* signing out locally matters more than the response */
  }
}

export async function sendEmailOtp(email: string): Promise<void> {
  await postJson("/api/auth/send-otp", { email });
}

export async function verifyEmailOtp(
  email: string,
  code: string,
  businessDetails?: {
    companyName: string;
    pan: string;
    cin: string;
    address: string;
    gstin?: string;
  },
): Promise<AuthUser> {
  const body = businessDetails
    ? { email, code, isBusiness: true, ...businessDetails }
    : { email, code };
  const data = await postJson("/api/auth/verify-otp", body);
  return data.user as AuthUser;
}
