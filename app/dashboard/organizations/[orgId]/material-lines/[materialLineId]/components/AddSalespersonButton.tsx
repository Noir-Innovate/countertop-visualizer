"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  orgId: string;
  materialLineId: string;
}

interface Candidate {
  profileId: string;
  fullName: string | null;
  email: string | null;
}

type Mode = "existing" | "invite";

export default function AddSalespersonButton({ orgId, materialLineId }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("existing");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [email, setEmail] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const apiBase = `/api/organizations/${orgId}/material-lines/${materialLineId}/salespeople`;

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
    setSuccess(null);
    setSelectedProfileId("");
    setEmail("");
  }, []);

  // Load candidate salespeople when the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCandidatesLoading(true);
    fetch(apiBase)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setCandidates((data.candidates as Candidate[]) || []);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, apiBase]);

  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, close]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload =
      mode === "existing"
        ? { mode, profileId: selectedProfileId }
        : { mode, email: email.trim() };

    if (mode === "existing" && !selectedProfileId) {
      setError("Select a salesperson to add.");
      return;
    }
    if (mode === "invite" && !email.trim()) {
      setError("Enter an email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setSuccess(
        mode === "existing"
          ? "Salesperson added to this line."
          : `Invitation sent to ${email.trim()}.`,
      );
      router.refresh();
      setTimeout(close, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        Add salesperson
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                Add salesperson
              </h2>
              <button
                onClick={close}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {/* Mode toggle */}
              <div className="flex p-1 mb-4 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMode("existing");
                    setError(null);
                  }}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                    mode === "existing"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Add existing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("invite");
                    setError(null);
                  }}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                    mode === "invite"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Invite new
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  {success}
                </div>
              )}

              <form onSubmit={submit} className="space-y-4">
                {mode === "existing" ? (
                  <div>
                    <label
                      htmlFor="salesperson"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Salesperson
                    </label>
                    {candidatesLoading ? (
                      <p className="text-sm text-slate-500">Loading…</p>
                    ) : candidates.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No unassigned salespeople available. Use “Invite new” to
                        add one.
                      </p>
                    ) : (
                      <select
                        id="salesperson"
                        value={selectedProfileId}
                        onChange={(e) => setSelectedProfileId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select a salesperson…</option>
                        {candidates.map((c) => (
                          <option key={c.profileId} value={c.profileId}>
                            {c.fullName
                              ? `${c.fullName}${c.email ? ` (${c.email})` : ""}`
                              : c.email || c.profileId}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Existing salespeople in this organization who aren’t yet on
                      this line.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="salesperson@example.com"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      We’ll email an invitation to join as a salesperson on this
                      line.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    (mode === "existing"
                      ? !selectedProfileId
                      : !email.trim())
                  }
                  className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {isSubmitting
                    ? mode === "existing"
                      ? "Adding…"
                      : "Sending…"
                    : mode === "existing"
                      ? "Add to line"
                      : "Send invitation"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
