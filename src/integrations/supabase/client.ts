const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

// Automatically intercept all fetch requests to our backend URL and include credentials/cookies
if (typeof window !== "undefined") {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    let url = "";
    if (typeof input === "string") {
      url = input;
    } else if (input && typeof input === "object" && "url" in input) {
      url = (input as any).url;
    }

    if (BACKEND_URL && url.startsWith(BACKEND_URL)) {
      init = init || {};
      init.credentials = "include";
    }
    return originalFetch.call(this, input, init);
  };
}

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

const mockSingleRecord = {
  id: 999,
  reference_no: "CC-REG-100001",
  full_name: "Local Developer",
  mobile: "9999999999",
  company_name: "Cloudcrest BM Testing",
};

// Chained query mock resolving to mock records to avoid runtime errors on local calls
const mockQuery: any = {
  select: () => mockQuery,
  eq: () => mockQuery,
  order: () => mockQuery,
  limit: () => mockQuery,
  insert: () => mockQuery,
  upsert: () => mockQuery,
  single: () => Promise.resolve({ data: mockSingleRecord, error: null }),
  maybeSingle: () => Promise.resolve({ data: mockSingleRecord, error: null }),
  then: (onfulfilled: any) => Promise.resolve({ data: [mockSingleRecord], error: null, count: 1 }).then(onfulfilled),
  catch: (onrejected: any) => Promise.resolve({ data: [mockSingleRecord], error: null, count: 1 }).catch(onrejected),
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
      const response = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
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
      const response = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
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
        await fetch(`${BACKEND_URL}/api/auth/logout`, { method: "POST" });
      } catch (err) {}
      
      window.location.reload();
    }
    return { error: null };
  },
  setSession: (tokens: any) => {
    return Promise.resolve({ data: { session: getMockSession() }, error: null });
  }
};

const mockStorage = {
  from: () => ({
    upload: () => Promise.resolve({ data: { path: "mock-path" }, error: null }),
    createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://example.com/mock-file.pdf" }, error: null }),
  }),
};

export const supabase: any = {
  auth: mockAuth,
  from: () => mockQuery,
  storage: mockStorage,
};
