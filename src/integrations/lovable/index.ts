// Mock Lovable Auth for Local Development

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple" | "microsoft" | "lovable", opts?: any) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem("mock_user_email", "google-user@cloudcrest.com");
        localStorage.setItem("mock_logged_out", "false");
        // Reload to let useAuth pick up the mockSession immediately
        window.location.reload();
      }
      return { error: null, redirected: false };
    },
  },
};
