"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  orgId: string;
  materialLineId: string;
  materialLineName: string;
  publicUrl: string;
}

export function OnboardingDoneActions({
  orgId,
  materialLineId,
  materialLineName,
  publicUrl,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const shareSubject = `Try our countertop visualizer — ${materialLineName}`;
  const shareBody = `Take a look at our new countertop visualizer:\n${publicUrl}`;
  const mailto = `mailto:?subject=${encodeURIComponent(shareSubject)}&body=${encodeURIComponent(shareBody)}`;
  const sms = `sms:?&body=${encodeURIComponent(shareBody)}`;

  return (
    <div className="mt-8 space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm font-medium text-slate-700 mb-2">
          Your visualizer URL
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={publicUrl}
            className="flex-1 px-4 py-3 rounded-lg border border-slate-300 font-mono text-sm bg-slate-50"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={copy}
            className="px-5 py-3 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Share this with customers in the showroom or on in-home visits.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block px-5 py-4 rounded-xl bg-blue-600 text-white text-center font-semibold hover:bg-blue-700 transition-colors"
        >
          Open visualizer →
        </a>
        <Link
          href={`/dashboard/organizations/${orgId}/team`}
          className="block px-5 py-4 rounded-xl border border-slate-300 text-slate-800 text-center font-semibold hover:bg-slate-50 transition-colors"
        >
          Invite your sales team
        </Link>
        <a
          href={mailto}
          className="block px-5 py-4 rounded-xl border border-slate-300 text-slate-800 text-center font-medium hover:bg-slate-50 transition-colors"
        >
          Share via email
        </a>
        <a
          href={sms}
          className="block px-5 py-4 rounded-xl border border-slate-300 text-slate-800 text-center font-medium hover:bg-slate-50 transition-colors"
        >
          Share via SMS
        </a>
      </div>

      <div className="text-center">
        <Link
          href={`/dashboard/organizations/${orgId}/material-lines/internal/${materialLineId}`}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Manage this material line →
        </Link>
      </div>
    </div>
  );
}
