import { useEffect, useCallback, useSyncExternalStore } from "react";
import { fetchCurrentUser, logout as logoutRequest, type AuthUser } from "@/lib/auth-api";

// The session lives in an httpOnly cookie, so the current user can only be learned
// by asking the backend. Several components use this hook on one screen, so the
// result is kept in a tiny module-level store and the request is shared.
type AuthState = { user: AuthUser | null; loading: boolean };

let state: AuthState = { user: null, loading: true };
let inFlight: Promise<AuthUser | null> | null = null;
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverSnapshot: AuthState = { user: null, loading: true };

/** Ask the backend who we are. Concurrent callers share one request. */
function load(force = false): Promise<AuthUser | null> {
  if (inFlight && !force) return inFlight;
  inFlight = fetchCurrentUser()
    .then((user) => {
      setState({ user, loading: false });
      return user;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Re-read the session from the backend and notify every `useAuth` consumer.
 * Call this after any sign-in that sets the `auth_token` cookie — without it the
 * store keeps serving the cached "signed out" snapshot.
 */
export function refreshAuth(): Promise<AuthUser | null> {
  return load(true);
}

export function useAuth() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => serverSnapshot);

  useEffect(() => {
    if (state.loading) void load();
  }, []);

  const refresh = useCallback(() => load(true), []);

  const signOut = useCallback(async () => {
    await logoutRequest();
    setState({ user: null, loading: false });
    // Full reload so every cached view drops the previous user's data.
    if (typeof window !== "undefined") window.location.href = "/";
  }, []);

  return {
    user: snapshot.user,
    loading: snapshot.loading,
    signOut,
    refresh,
    isAuthenticated: !!snapshot.user,
    isAdmin: snapshot.user?.roleName === "Admin",
  };
}
