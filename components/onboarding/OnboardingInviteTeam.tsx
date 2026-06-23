"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackOnboarding, ONBOARDING_EVENTS } from "@/lib/onboarding-track";

interface Props {
  orgId: string;
  materialLineId: string;
  doneUrl: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OnboardingInviteTeam({
  orgId,
  materialLineId,
  doneUrl,
}: Props) {
  const router = useRouter();
  const [emails, setEmails] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateEmail = (index: number, value: string) => {
    setEmails((prev) => prev.map((e, i) => (i === index ? value : e)));
  };

  const addRow = () => setEmails((prev) => [...prev, ""]);

  const removeRow = (index: number) =>
    setEmails((prev) => prev.filter((_, i) => i !== index));

  const skip = () => {
    trackOnboarding(ONBOARDING_EVENTS.teamSkipped, {
      organizationId: orgId,
      materialLineId,
    });
    router.push(doneUrl);
    router.refresh();
  };

  const submit = async () => {
    setError(null);
    const toInvite = emails.map((e) => e.trim()).filter((e) => e.length > 0);

    if (toInvite.length === 0) {
      skip();
      return;
    }

    const invalid = toInvite.find((e) => !EMAIL_RE.test(e));
    if (invalid) {
      setError(`"${invalid}" is not a valid email address.`);
      return;
    }

    setSubmitting(true);
    try {
      const results = await Promise.all(
        toInvite.map(async (email) => {
          const res = await fetch(`/api/organizations/${orgId}/invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              role: "sales_person",
              assignedMaterialLineIds: [materialLineId],
            }),
          });
          const body = await res.json().catch(() => ({}));
          return { email, ok: res.ok, error: body?.error as string | undefined };
        }),
      );

      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setError(
          failed
            .map((f) => `${f.email}: ${f.error ?? "failed to invite"}`)
            .join(" • "),
        );
        setSubmitting(false);
        return;
      }

      trackOnboarding(ONBOARDING_EVENTS.teamInvited, {
        organizationId: orgId,
        materialLineId,
        count: results.length,
      });
      router.push(doneUrl);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div className="space-y-3">
        {emails.map((email, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => updateEmail(i, e.target.value)}
              placeholder="salesperson@example.com"
              className="flex-1 px-4 py-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {emails.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-slate-400 hover:text-slate-600 px-2"
                aria-label="Remove"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
      >
        + Add another
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="flex-1 px-5 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {submitting ? "Sending invites…" : "Send invites & continue"}
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={submitting}
          className="px-5 py-3 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
