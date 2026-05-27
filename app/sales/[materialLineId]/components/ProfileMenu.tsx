"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface UserInfo {
  id: string;
  email: string | null;
  fullName: string | null;
}

function initials(info: UserInfo | null): string {
  if (!info) return "?";
  const source = info.fullName?.trim() || info.email?.trim() || "";
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfileMenu() {
  const router = useRouter();
  const [info, setInfo] = useState<UserInfo | null>(null);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setInfo({
        id: user.id,
        email: user.email ?? null,
        fullName: (profile?.full_name as string) ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/dashboard/login");
    router.refresh();
  };

  const display = info?.fullName?.trim() || info?.email || "Account";
  const sub = info?.fullName?.trim() ? info?.email : null;

  return (
    <div ref={popRef} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-900 truncate">
              {display}
            </p>
            {sub && (
              <p className="text-xs text-slate-500 truncate">{sub}</p>
            )}
          </div>
          <ul className="py-1">
            <li>
              <Link
                href="/dashboard/profile"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Profile
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/account/affiliate"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Affiliate
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/account/security"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Security
              </Link>
            </li>
          </ul>
          <div className="border-t border-slate-100">
            <button
              onClick={signOut}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
      >
        <span className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
          {initials(info)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900 truncate">
            {display}
          </span>
          {sub && (
            <span className="block text-xs text-slate-500 truncate">{sub}</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
    </div>
  );
}
