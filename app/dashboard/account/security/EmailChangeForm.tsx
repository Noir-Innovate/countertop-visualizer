"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  currentEmail: string;
  pendingEmail: string | null;
}

export function EmailChangeForm({ currentEmail, pendingEmail }: Props) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<string | null>(pendingEmail);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (email.toLowerCase() === currentEmail.toLowerCase()) {
      setError("That's already your current email.");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase.auth.updateUser({ email });
      if (updErr) throw new Error(updErr.message);
      setPending(email);
      setSuccess(
        `Verification link sent to ${email}. Click it to complete the change.`,
      );
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update email");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Change email</h2>
        <p className="text-sm text-slate-600 mt-1">
          Current address: <span className="font-medium">{currentEmail}</span>
        </p>
        {pending && (
          <p className="text-sm text-amber-700 mt-1">
            Pending verification: <span className="font-medium">{pending}</span>
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          New email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="you@example.com"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send verification link"}
      </button>
    </form>
  );
}
