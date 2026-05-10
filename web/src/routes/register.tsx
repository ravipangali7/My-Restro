import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { resolvePostAuthDestination } from "@/lib/portal-routes";
import { apiPost, formatRequestOtpSendError } from "@/lib/api";
import type { AuthUser } from "@/lib/auth-context";
import { Phone, UserPlus } from "lucide-react";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" && search.redirect.length < 2048 ? search.redirect : undefined,
  }),
  component: RegisterPage,
});

interface VerifyResponse {
  token: string;
  user: AuthUser;
}

interface RequestOtpResponse {
  detail: string;
  phone: string;
  debug_otp?: string;
  sms_sent?: boolean;
}

function RegisterPage() {
  const [step, setStep] = useState<"details" | "otp">("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { loginWithToken, isAuthenticated, user, isHydrated } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  useEffect(() => {
    if (isHydrated && isAuthenticated && user) {
      const dest = resolvePostAuthDestination(user.portal_role, redirect);
      navigate({ to: dest });
    }
  }, [isHydrated, isAuthenticated, user, navigate, redirect]);

  const handleSendOtp = async () => {
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!phone.trim()) {
      setError("Enter a phone number.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await apiPost<RequestOtpResponse>("/api/auth/request-otp/", {
        phone: phone.trim(),
        purpose: "register",
      });
      setDevOtpHint(res.debug_otp ?? null);
      setStep("otp");
    } catch (e) {
      setError(formatRequestOtpSendError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length < 6) return;
    setError(null);
    setBusy(true);
    try {
      const data = await apiPost<VerifyResponse>("/api/auth/verify-otp/", {
        phone: phone.trim(),
        otp,
        purpose: "register",
        name: name.trim(),
      });
      loginWithToken(data.token, data.user);
      const dest = resolvePostAuthDestination(data.user.portal_role, redirect);
      navigate({ to: dest });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full min-w-0 max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-display font-bold text-2xl mx-auto mb-4 shadow-lg shadow-primary/30">MR</div>
          <h1 className="font-display font-bold text-2xl text-foreground">My Restro</h1>
          <p className="text-text-secondary text-sm mt-1">Create your account</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          {error && (
            <p className="text-sm text-error mb-4 bg-error/10 px-3 py-2 rounded-lg">{error}</p>
          )}
          {step === "details" ? (
            <>
              <h2 className="font-display font-semibold text-lg text-foreground mb-1">Sign up</h2>
              <p className="text-sm text-text-muted mb-4">We will send a one-time code to your phone to complete registration.</p>
              <label className="text-xs font-medium text-text-secondary block mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm mb-3 focus:border-primary outline-none"
              />
              <label className="text-xs font-medium text-text-secondary block mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919876543210"
                autoComplete="tel"
                className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm mb-5 focus:border-primary outline-none"
              />
              <button
                type="button"
                onClick={() => void handleSendOtp()}
                disabled={busy || !name.trim() || !phone.trim()}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Phone size={16} /> Send OTP
              </button>
              <p className="text-center text-sm text-text-muted mt-5">
                Already have an account?{" "}
                <Link
                  to="/login"
                  search={redirect ? { redirect } : {}}
                  className="font-medium text-primary hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <h2 className="font-display font-semibold text-lg text-foreground mb-1">Verify OTP</h2>
              <p className="text-sm text-text-muted mb-2 break-words">
                Hi <span className="font-medium text-foreground">{name.trim()}</span> — enter the code for{" "}
                <span className="font-medium text-foreground break-all">{phone}</span>
              </p>
              {!devOtpHint && (
                <p className="text-xs text-text-secondary mb-4">
                  Check your SMS for a 6-digit verification code.
                </p>
              )}
              {devOtpHint && (
                <p className="text-xs text-foreground border border-primary/25 bg-primary-50 px-3 py-2 rounded-lg mb-4">
                  SMS was not delivered — use this code (development / testing):{" "}
                  <span className="font-mono font-semibold text-primary">{devOtpHint}</span>
                </p>
              )}
              <div className="mb-6 grid w-full grid-cols-6 gap-1 sm:gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <input
                    key={i}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={otp[i] || ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(-1);
                      if (val.length <= 1) {
                        const n = otp.split("");
                        n[i] = val;
                        setOtp(n.join(""));
                        if (val && i < 5) {
                          const next = e.target.nextElementSibling as HTMLInputElement;
                          next?.focus();
                        }
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !otp[i] && i > 0) {
                        const prev = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                        prev?.focus();
                      }
                    }}
                    className="h-10 w-full min-w-0 rounded-lg border-2 border-border bg-card text-center text-base font-mono font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 sm:h-12 sm:rounded-xl sm:text-lg"
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={busy || otp.length < 6}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <UserPlus size={16} /> Verify and create account
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("details");
                  setOtp("");
                  setDevOtpHint(null);
                }}
                className="w-full mt-3 text-sm text-text-secondary hover:text-foreground transition-colors"
              >
                ← Edit details
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
