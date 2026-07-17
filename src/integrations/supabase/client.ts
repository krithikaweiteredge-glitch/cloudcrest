// Mock Supabase Client supporting customizable email sign-in for local development

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
  signInWithOtp: (params: any) => {
    if (typeof window !== 'undefined' && params.email) {
      localStorage.setItem("mock_temp_email", params.email);
    }
    return Promise.resolve({ data: { user: null }, error: null });
  },
  verifyOtp: (params: any) => {
    if (typeof window !== 'undefined') {
      const email = params.email || localStorage.getItem("mock_temp_email") || "developer@cloudcrest.com";
      localStorage.setItem("mock_user_email", email);
      localStorage.setItem("mock_logged_out", "false");
    }
    return Promise.resolve({ data: { user: getMockUser(), session: getMockSession() }, error: null });
  },
  signOut: () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem("mock_logged_out", "true");
      localStorage.removeItem("mock_user_email");
      localStorage.removeItem("mock_temp_email");
      window.location.reload();
    }
    return Promise.resolve({ error: null });
  },
  setSession: (tokens: any) => {
    return Promise.resolve({ data: { session: getMockSession() }, error: null });
  }
};

export const supabase: any = {
  auth: mockAuth,
  from: () => mockQuery,
};
