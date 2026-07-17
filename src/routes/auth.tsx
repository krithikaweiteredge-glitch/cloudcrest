import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Mail, Phone, ArrowRight, ShieldCheck, Loader2, KeyRound } from "lucide-react";
import logo from "@/assets/cloudcrest-logo.png";
import { z } from "zod";

type Search = { next?: string };

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Cloudcrest BM" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email().max(255);
const phoneSchema = z.string().trim().regex(/^\+?[0-9]{10,15}$/, "Enter 10–15 digit phone");
const otpSchema = z.string().trim().regex(/^[0-9]{6}$/, "6-digit code");

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "info"; text: string } | null>(null);

  // Redirect if already signed in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: next ?? "/profile", replace: true });
    });
  }, [navigate, next]);

  const target = next && next.startsWith("/") ? next : "/profile";

  const sendOtp = async () => {
    setMsg(null);
    try {
      if (mode === "email") {
        const email = emailSchema.parse(contact);
        setBusy(true);
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin + target },
        });
        if (error) throw error;
      } else {
        const phone = phoneSchema.parse(contact.startsWith("+") ? contact : "+91" + contact);
        setBusy(true);
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
      }
      setOtpSent(true);
      setMsg({ type: "info", text: `Code sent to your ${mode}. Check inbox / SMS.` });
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed to send code" });
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setMsg(null);
    try {
      otpSchema.parse(otp);
      setBusy(true);
      const payload =
        mode === "email"
          ? { email: contact, token: otp, type: "email" as const }
          : {
              phone: contact.startsWith("+") ? contact : "+91" + contact,
              token: otp,
              type: "sms" as const,
            };
      const { error } = await supabase.auth.verifyOtp(payload);
      if (error) throw error;
      navigate({ to: target, replace: true });
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Invalid code" });
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (res.error) throw res.error;
      if (!res.redirected) navigate({ to: target, replace: true });
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Google sign-in failed" });
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
            Track every filing, upload documents once, and talk to a Cloudcrest BM advisor —
            all from a single account.
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
          <h2 className="text-2xl font-display font-semibold">Sign in or create account</h2>
          <p className="text-sm text-muted-foreground mt-1.5">
            No passwords. Continue with Google, or receive a one-time code.
          </p>

          <button
            onClick={google}
            disabled={busy}
            className="mt-6 w-full flex items-center justify-center gap-3 h-11 rounded-lg border border-border bg-surface hover:bg-muted transition-colors text-sm font-medium disabled:opacity-60"
          >
            <GoogleIcon /> Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 text-[11px] mono uppercase text-muted-foreground">
            <div className="flex-1 h-px bg-border" /> or use OTP <div className="flex-1 h-px bg-border" />
          </div>

          <div className="flex gap-1 p-1 rounded-lg bg-muted mb-4">
            {(["email", "phone"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setOtpSent(false);
                  setContact("");
                  setOtp("");
                  setMsg(null);
                }}
                className={
                  "flex-1 h-8 rounded-md text-xs font-medium capitalize flex items-center justify-center gap-1.5 transition-all " +
                  (mode === m ? "bg-surface shadow-card text-foreground" : "text-muted-foreground")
                }
              >
                {m === "email" ? <Mail className="size-3.5" /> : <Phone className="size-3.5" />}
                {m}
              </button>
            ))}
          </div>

          {!otpSent ? (
            <div className="space-y-3">
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                type={mode === "email" ? "email" : "tel"}
                placeholder={mode === "email" ? "you@company.in" : "98765 43210"}
                className="w-full h-11 bg-input border border-border rounded-lg px-3 text-sm ring-focus"
              />
              <button
                onClick={sendOtp}
                disabled={busy || !contact}
                className="w-full h-11 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                Send code
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[12px] text-muted-foreground">
                Code sent to <span className="font-medium text-foreground">{contact}</span>
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
                className="w-full h-11 rounded-lg gradient-brand text-white text-sm font-semibold shadow-brand flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Verify &amp; continue
              </button>
              <button
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                Change {mode}
              </button>
            </div>
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12S6.8 21.5 12 21.5c6.9 0 11.5-4.9 11.5-11.7 0-.8-.1-1.4-.2-2H12z"/>
      <path fill="#34A853" d="M3.5 7.7l3.2 2.4C7.6 8 9.6 6.5 12 6.5c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.9 14.6 3 12 3 8.1 3 4.8 5 3.5 7.7z" opacity="0"/>
    </svg>
  );
}
