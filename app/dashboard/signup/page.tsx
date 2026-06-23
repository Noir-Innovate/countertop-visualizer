"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { captureAndPersistAttribution } from "@/lib/attribution";
import {
  ONBOARDING_EVENTS,
  trackOnboarding,
} from "@/lib/onboarding-track";

export default function SignupPage() {

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [resendState, setResendState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  useEffect(() => {
    captureAndPersistAttribution();
    trackOnboarding(ONBOARDING_EVENTS.signupViewed);
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (!refCode) return;
    fetch(`/api/referrals/validate?code=${encodeURIComponent(refCode)}`)
      .then((r) => r.json())
      .then((body) => {
        if (body?.valid && body.referrerName) {
          setReferrerName(body.referrerName);
        }
      })
      .catch(() => undefined);
  }, []);

  const emailRedirectTo = () =>
    `${window.location.origin}/auth/callback?next=/dashboard`;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAlreadyRegistered(false);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      // Authoritative pre-check: signUp() silently no-ops for an existing email
      // (returns an obfuscated user with empty identities and sends NO email),
      // which would otherwise show a fake "check your email" screen. Catch it
      // up front so we can tell the user to sign in instead.
      try {
        const res = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const body = await res.json();
        if (body?.exists) {
          setAlreadyRegistered(true);
          setError(
            "An account with this email already exists. Please sign in instead.",
          );
          return;
        }
      } catch {
        // Non-fatal: fall through to signUp, which still has the identities
        // guard below as a backstop.
      }

      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          // After confirmation: auth callback exchanges the code (auto-login)
          // then the onboarding state machine routes new users to
          // /dashboard/organizations/new. Falls back to the marketing root
          // if Supabase's redirect-URL allowlist doesn't include this path
          // — add the callback URL there in the Supabase Dashboard.
          emailRedirectTo: emailRedirectTo(),
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Backstop for the existing-email case: when email confirmation is on,
      // signUp() returns a user with an empty `identities` array for an address
      // that already exists. Treat that as "already registered", not success.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setAlreadyRegistered(true);
        setError(
          "An account with this email already exists. Please sign in instead.",
        );
        return;
      }

      // Carry the new profile id so the funnel can dedup by user even
      // before email confirmation closes the loop.
      trackOnboarding(ONBOARDING_EVENTS.signupSubmitted, {
        profileId: data.user?.id,
      });
      setSuccess(true);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendState("sending");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: emailRedirectTo() },
      });
      setResendState(error ? "error" : "sent");
    } catch {
      setResendState("error");
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Check Your Email
            </h1>
            <p className="text-slate-600 mb-6">
              We&apos;ve sent a confirmation link to <strong>{email}</strong>.
              Click the link to activate your account.
            </p>
            <Link
              href="/dashboard/login"
              className="inline-block py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all"
            >
              Back to Login
            </Link>
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-sm text-slate-500 mb-2">
                Didn&apos;t get the email? Check your spam folder, or
              </p>
              {resendState === "sent" ? (
                <p className="text-sm text-green-600 font-medium">
                  Confirmation email resent. Please check your inbox.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendState === "sending"}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                >
                  {resendState === "sending"
                    ? "Resending…"
                    : "Resend confirmation email"}
                </button>
              )}
              {resendState === "error" && (
                <p className="text-sm text-red-600 mt-2">
                  Couldn&apos;t resend right now. Please wait a moment and try
                  again.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900">
              Create Your Account
            </h1>
            <p className="text-slate-600 mt-2">
              Start visualizing countertops for your customers
            </p>
          </div>

          {referrerName && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-emerald-800 text-sm">
                You were invited by <strong>{referrerName}</strong>.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
              {alreadyRegistered && (
                <Link
                  href={`/dashboard/login?email=${encodeURIComponent(email)}`}
                  className="inline-block mt-2 text-sm font-medium text-red-800 underline hover:text-red-900"
                >
                  Go to sign in
                </Link>
              )}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="John Doe"
                required
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link
              href="/dashboard/login"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
