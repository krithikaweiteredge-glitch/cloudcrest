// Custom Supabase Client pointing to real Node.js/PostgreSQL backend for OTP authentication

const getMockUser = () => {
  if (typeof window === 'undefined') return null;
  const email = localStorage.getItem("mock_user_email");
  if (!email) return null;
  return {
    id: "mock-user-id-" + email.replace(/[^a-zA-Z0-9]/g, ""),
    email: email,
    user_metadata: {
      full_name: email.split('@')[0],
    },
    role: "authenticated",
  };
};

const getMockSession = () => {
  const user = getMockUser();
  if (!user) return null;
  return {
    access_token: "mock-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
};

// Chained query mock resolving to empty sets to avoid runtime errors on local db calls
const mockQuery: any = {
  select: () => mockQuery,
  eq: () => mockQuery,
  order: () => mockQuery,
  limit: () => mockQuery,
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
  insert: () => Promise.resolve({ data: null, error: null }),
  upsert: () => Promise.resolve({ data: null, error: null }),
  then: (onfulfilled: any) => Promise.resolve({ data: [], error: null, count: 0 }).then(onfulfilled),
  catch: (onrejected: any) => Promise.resolve({ data: [], error: null, count: 0 }).catch(onrejected),
};

const mockAuth = {
  onAuthStateChange: (callback: any) => {
    const isLoggedOut = typeof window !== 'undefined' && localStorage.getItem("mock_logged_out") === "true";
    const session = isLoggedOut ? null : getMockSession();
    
    // Call callback immediately with the initial auth event
    setTimeout(() => {
      callback(session ? "SIGNED_IN" : "SIGNED_OUT", session);
    }, 0);

    return {
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    };
  },
  getSession: () => {
    const isLoggedOut = typeof window !== 'undefined' && localStorage.getItem("mock_logged_out") === "true";
    const session = isLoggedOut ? null : getMockSession();
    return Promise.resolve({ data: { session }, error: null });
  },
  getUser: () => {
    const isLoggedOut = typeof window !== 'undefined' && localStorage.getItem("mock_logged_out") === "true";
    const user = isLoggedOut ? null : getMockUser();
    return Promise.resolve({ data: { user }, error: isLoggedOut || !user ? new Error("Not logged in") : null });
  },
  signInWithOtp: async (params: any) => {
    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: params.email }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }
      return { data: { user: null }, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },
  verifyOtp: async (params: any) => {
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: params.email, code: params.token }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to verify code");
      }
      
      // Save session in local storage for navigation & profile rendering
      if (typeof window !== 'undefined') {
        localStorage.setItem("mock_user_email", data.user.email);
        localStorage.setItem("mock_logged_out", "false");
      }
      
      return { data: { user: data.user, session: {} }, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },
  signOut: async () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem("mock_logged_out", "true");
      localStorage.removeItem("mock_user_email");
      localStorage.removeItem("mock_temp_email");
      
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch (err) {}
      
      window.location.reload();
    }
    return { error: null };
  },
  setSession: (tokens: any) => {
    return Promise.resolve({ data: { session: getMockSession() }, error: null });
  }
};

export const supabase: any = {
  auth: mockAuth,
  from: () => mockQuery,
};
