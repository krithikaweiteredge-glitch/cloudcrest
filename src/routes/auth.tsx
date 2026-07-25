import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchCurrentUser, sendEmailOtp, verifyEmailOtp } from "@/lib/auth-api";
import { refreshAuth } from "@/hooks/use-auth";
import {
  Mail,
  ArrowRight,
  ShieldCheck,
  Loader2,
  KeyRound,
  Lock,
  ShieldAlert,
  Building2,
  CreditCard,
  Hash,
  MapPin,
  Landmark,
  User,
} from "lucide-react";
import logo from "@/assets/cloudcrest-logo.png";
import { z } from "zod";

// Firebase Client Imports
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

// Load configuration dynamically
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isFirebaseConfigured = !!firebaseConfig.apiKey;

let firebaseAuth: any = null;
if (isFirebaseConfigured) {
  try {
    if (getApps().length === 0) {
      const app = initializeApp(firebaseConfig);
      firebaseAuth = getAuth(app);
    } else {
      firebaseAuth = getAuth();
    }
  } catch (error) {
    console.error("Failed to initialize Firebase Auth client:", error);
  }
}

type Search = { next?: string; admin?: boolean };

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Cloudcrest BM" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    next: typeof s.next === "string" ? s.next : undefined,
    admin: s.admin === true || s.admin === "1" || s.admin === "true" ? true : undefined,
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Invalid email address").max(255);
const otpSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{6}$/, "6-digit code");

// Basic validation schemas for business details
const companyNameSchema = z.string().trim().min(2, "Company Name must be at least 2 characters");
const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Enter a valid 10-digit PAN");
const cinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[LUlu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/, "Enter a valid 21-digit CIN");
const addressSchema = z.string().trim().min(5, "Address must be at least 5 characters");
const gstSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    "Enter a valid 15-digit GSTIN",
  )
  .optional()
  .or(z.literal(""));

function AuthPage() {
  const navigate = useNavigate();
  const { next, admin } = Route.useSearch();
  // Three peer tabs: Individual, Business, Administrator. The customer forms live
  // on the first two; the admin email/password form on the third.
  const [activeTab, setActiveTab] = useState<"individual" | "business" | "admin">(
    admin ? "admin" : "individual",
  );
  const isBusiness = activeTab === "business";
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "info"; text: string } | null>(null);

  // Business specific fields
  const [companyName, setCompanyName] = useState("");
  const [pan, setPan] = useState("");
  const [cin, setCin] = useState("");
  const [address, setAddress] = useState("");
  const [gst, setGst] = useState("");

  // Admin login mode states
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // Where a customer (OTP / Google) sign-in should land. Never honor an admin
  // route here — those are only reachable through the admin password login — so a
  // leftover `next=/admin` (e.g. after an admin logs out) can't send a customer there.
  const target = next && next.startsWith("/") && !next.startsWith("/admin") ? next : "/profile";

  // Redirect if already signed in
  useEffect(() => {
    fetchCurrentUser().then((current) => {
      if (current) navigate({ to: target, replace: true });
    });
  }, [navigate, target]);

  const sendOtp = async () => {
    setMsg(null);
    try {
      const validatedEmail = emailSchema.parse(email);

      if (isBusiness) {
        companyNameSchema.parse(companyName);
        panSchema.parse(pan);
        cinSchema.parse(cin);
        addressSchema.parse(address);
        if (gst) {
          gstSchema.parse(gst);
        }
      }

      setBusy(true);
      await sendEmailOtp(validatedEmail);
      setOtpSent(true);
      setMsg({ type: "info", text: `Verification code sent to ${validatedEmail}. Check inbox.` });
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        setMsg({ type: "err", text: e.errors[0].message });
      } else {
        setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed to send code" });
      }
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setMsg(null);
    try {
      otpSchema.parse(otp);
      setBusy(true);

      const validatedEmail = emailSchema.parse(email);
      let businessDetails = undefined;

      if (isBusiness) {
        businessDetails = {
          companyName: companyNameSchema.parse(companyName),
          pan: panSchema.parse(pan),
          cin: cinSchema.parse(cin),
          address: addressSchema.parse(address),
          gstin: gst ? gstSchema.parse(gst) : undefined,
        };
      }

      await verifyEmailOtp(validatedEmail, otp, businessDetails);
      await refreshAuth();
      navigate({ to: target, replace: true });
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        setMsg({ type: "err", text: e.errors[0].message });
      } else {
        setMsg({ type: "err", text: e instanceof Error ? e.message : "Invalid verification code" });
      }
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (isFirebaseConfigured && firebaseAuth) {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });

        const result = await signInWithPopup(firebaseAuth, provider);
        const idToken = await result.user.getIdToken();

        const backendUrl = (import.meta.env.VITE_BACKEND_URL || "http://localhost:5000").replace(
          /\/$/,
          "",
        );
        const loginRes = await fetch(`${backendUrl}/api/auth/google-login`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firebaseToken: idToken }),
        });

        const loginData = await loginRes.json();
        if (!loginRes.ok) {
          throw new Error(loginData.error || "Google sign-in failed");
        }

        await refreshAuth();
        navigate({ to: target, replace: true });
      } else {
        throw new Error(
          "Google sign-in isn't configured on this environment. Use the email OTP option.",
        );
      }
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Google sign-in failed" });
      setBusy(false);
    }
  };

  const adminLogin = async () => {
    setMsg(null);
    if (!adminEmail.trim() || !adminPassword) {
      setMsg({ type: "err", text: "Enter both your admin email and password." });
      return;
    }
    setBusy(true);
    try {
      const backendUrl = (import.meta.env.VITE_BACKEND_URL || "http://localhost:5000").replace(
        /\/$/,
        "",
      );
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail.trim(), password: adminPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid email or password");

      if (data.user?.roleName !== "Admin") {
        await fetch(`${backendUrl}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
        throw new Error("This account does not have administrator access.");
      }

      await refreshAuth();
      navigate({ to: "/admin", replace: true });
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Admin sign in failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left brand */}
      <div className="hidden lg:flex flex-col justify-between gradient-hero text-white p-10 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, oklch(0.58 0.22 27 / 0.35), transparent 40%), radial-gradient(circle at 80% 80%, oklch(0.62 0.16 152 / 0.35), transparent 45%), radial-gradient(circle at 60% 30%, oklch(0.55 0.20 255 / 0.35), transparent 45%)",
          }}
        />
        <Link to="/" className="relative flex items-center gap-3">
          <img src={logo} alt="Cloudcrest BM" className="h-10 w-auto" />
          <div className="font-display font-semibold tracking-tight">Cloudcrest BM</div>
        </Link>
        <div className="relative space-y-6 max-w-md">
          <h1 className="text-4xl font-display font-semibold leading-tight">
            Your compliance workspace,
            <br />
            <span className="text-primary">one secure sign-in away.</span>
          </h1>
          <p className="text-white/70 text-[15px] leading-relaxed">
            Track every filing, upload documents once, and talk to a Cloudcrest BM advisor — all
            from a single account.
          </p>
          <ul className="space-y-3 text-sm">
            {[
              "Bank-grade encryption for every document",
              "One profile across 22+ services",
              "Real-time status on every registration",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2 text-white/85">
                <ShieldCheck className="size-4 text-success" /> {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-[11px] mono text-white/40 uppercase tracking-widest">
          MCA · GST · Labour · Municipal · IP
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <img src={logo} alt="Cloudcrest BM" className="h-9 w-auto" />
          </Link>

          <h2 className="text-2xl font-display font-semibold">
            {activeTab === "admin" ? "Administrator sign in" : "Sign in or create account"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5">
            {activeTab === "admin"
              ? "Restricted access. Use your Cloudcrest BM admin email and password."
              : "No passwords. Continue with Google, or receive a one-time code."}
          </p>

          {/* Three peer tabs: Individual · Business · Administrator */}
          <div className="grid grid-cols-3 gap-1 bg-muted/60 p-1.5 rounded-xl border border-border/80 mb-6 mt-6">
            {(
              [
                { key: "individual", label: "Individual", icon: User },
                { key: "business", label: "Business", icon: Building2 },
                { key: "admin", label: "Admin", icon: ShieldAlert },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const selected = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setActiveTab(t.key);
                    setMsg(null);
                    setOtpSent(false);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide uppercase transition-all duration-200 cursor-pointer ${
                    selected
                      ? "bg-surface text-primary shadow-sm border border-border/20 font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {activeTab === "admin" ? (
            /* ---- Admin login form (email + password) ---- */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary text-xs font-semibold">
                <ShieldAlert className="size-4" /> Admin Portal
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground/80 block mb-1.5">
                  Admin Email
                </label>
                <div className="flex items-center gap-2 h-11 px-3 rounded-lg bg-input border border-border focus-within:border-primary/60 transition-colors">
                  <Mail className="size-4 text-muted-foreground" />
                  <input
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && adminLogin()}
                    type="email"
                    placeholder="admin@cloudcrest.com"
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground/80 block mb-1.5">
                  Password
                </label>
                <div className="flex items-center gap-2 h-11 px-3 rounded-lg bg-input border border-border focus-within:border-primary/60 transition-colors">
                  <Lock className="size-4 text-muted-foreground" />
                  <input
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && adminLogin()}
                    type="password"
                    placeholder="••••••••"
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={adminLogin}
                disabled={busy}
                className="w-full h-11 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand flex items-center justify-center gap-2 disabled:opacity-60 mt-1 cursor-pointer"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                Sign in to Admin Console
              </button>
            </div>
          ) : (
            /* ---- Customer sign-in (OTP, with Google at the bottom) ---- */
            <>
              {!otpSent ? (
                <div className="space-y-4">
                  {activeTab === "individual" ? (
                    /* ---- Individual User Form ---- */
                    <div>
                      <label className="text-[11px] font-medium text-foreground/80 block mb-1.5">
                        Email Address
                      </label>
                      <div className="flex items-center gap-2 h-11 px-3 rounded-lg bg-input border border-border focus-within:border-primary/60 transition-colors">
                        <Mail className="size-4 text-muted-foreground" />
                        <input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && email && sendOtp()}
                          type="email"
                          placeholder="you@domain.com"
                          className="flex-1 bg-transparent text-sm focus:outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    /* ---- Business User Form ---- */
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-medium text-foreground/80 block mb-1.5">
                          Email Address
                        </label>
                        <div className="flex items-center gap-2 h-11 px-3 rounded-lg bg-input border border-border focus-within:border-primary/60 transition-colors">
                          <Mail className="size-4 text-muted-foreground" />
                          <input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            type="email"
                            placeholder="business@company.com"
                            className="flex-1 bg-transparent text-sm focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-foreground/80 block mb-1.5">
                          Company Name
                        </label>
                        <div className="flex items-center gap-2 h-11 px-3 rounded-lg bg-input border border-border focus-within:border-primary/60 transition-colors">
                          <Building2 className="size-4 text-muted-foreground" />
                          <input
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            type="text"
                            placeholder="Acme Corporation Private Limited"
                            className="flex-1 bg-transparent text-sm focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-medium text-foreground/80 block mb-1.5">
                            PAN Number
                          </label>
                          <div className="flex items-center gap-2 h-11 px-3 rounded-lg bg-input border border-border focus-within:border-primary/60 transition-colors">
                            <CreditCard className="size-4 text-muted-foreground" />
                            <input
                              value={pan}
                              onChange={(e) => setPan(e.target.value.toUpperCase())}
                              type="text"
                              maxLength={10}
                              placeholder="ABCDE1234F"
                              className="flex-1 bg-transparent text-sm focus:outline-none uppercase"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-foreground/80 block mb-1.5">
                            CIN Number
                          </label>
                          <div className="flex items-center gap-2 h-11 px-3 rounded-lg bg-input border border-border focus-within:border-primary/60 transition-colors">
                            <Hash className="size-4 text-muted-foreground" />
                            <input
                              value={cin}
                              onChange={(e) => setCin(e.target.value.toUpperCase())}
                              type="text"
                              maxLength={21}
                              placeholder="U72200DL2021PTC123456"
                              className="flex-1 bg-transparent text-sm focus:outline-none uppercase"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-foreground/80 block mb-1.5">
                          Company Address
                        </label>
                        <div className="flex items-start gap-2 py-2.5 px-3 rounded-lg bg-input border border-border focus-within:border-primary/60 transition-colors">
                          <MapPin className="size-4 text-muted-foreground mt-0.5" />
                          <textarea
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="Enter office / company address"
                            rows={2}
                            className="flex-1 bg-transparent text-sm focus:outline-none resize-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-foreground/80 block mb-1.5">
                          GSTIN (Optional)
                        </label>
                        <div className="flex items-center gap-2 h-11 px-3 rounded-lg bg-input border border-border focus-within:border-primary/60 transition-colors">
                          <Landmark className="size-4 text-muted-foreground" />
                          <input
                            value={gst}
                            onChange={(e) => setGst(e.target.value.toUpperCase())}
                            type="text"
                            maxLength={15}
                            placeholder="07AAAAA1111A1Z1"
                            className="flex-1 bg-transparent text-sm focus:outline-none uppercase"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={sendOtp}
                    disabled={
                      busy ||
                      !email ||
                      (isBusiness && (!companyName || !pan || !cin || !address))
                    }
                    className="w-full h-11 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                    Send verification code
                  </button>

                  {/* Google sign-in, kept below the OTP form as a secondary option. */}
                  <div className="flex items-center gap-3 text-[11px] mono uppercase text-muted-foreground pt-1">
                    <div className="flex-1 h-px bg-border" /> or continue with{" "}
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <button
                    onClick={google}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-3 h-11 rounded-lg border border-border bg-surface hover:bg-muted transition-colors text-sm font-medium disabled:opacity-60 cursor-pointer"
                  >
                    <GoogleIcon /> Continue with Google
                  </button>
                </div>
              ) : (
                /* ---- OTP Code Verification Form ---- */
                <div className="space-y-4">
                  <div className="text-[12px] text-muted-foreground">
                    Code sent to <span className="font-medium text-foreground">{email}</span>
                  </div>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="6-digit code"
                    className="w-full h-11 bg-input border border-border rounded-lg px-3 text-center text-lg tracking-[0.5em] mono ring-focus"
                  />
                  <button
                    onClick={verifyOtp}
                    disabled={busy || otp.length !== 6}
                    className="w-full h-11 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <KeyRound className="size-4" />
                    )}
                    Verify &amp; continue
                  </button>
                  <button
                    onClick={() => {
                      setOtpSent(false);
                      setOtp("");
                    }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Change details / resend
                  </button>
                </div>
              )}
            </>
          )}

          {msg && (
            <div
              className={
                "mt-4 text-[12px] rounded-md px-3 py-2 border " +
                (msg.type === "err"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-primary/25 bg-primary/8 text-primary")
              }
            >
              {msg.text}
            </div>
          )}

          <p className="mt-8 text-[11px] text-muted-foreground text-center">
            By continuing you agree to Cloudcrest BM's Terms &amp; Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}

// Official four-colour Google "G" mark.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 2.92 29.93.75 24 .75 15.4.75 7.96 5.68 4.34 12.87l7.35 5.7C13.42 13.37 18.27 9.5 24 9.5z"
      />
    </svg>
  );
}
