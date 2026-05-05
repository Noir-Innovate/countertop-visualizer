"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { label: "Account", href: "/dashboard/account/profile" },
  { label: "Security", href: "/dashboard/account/security" },
  { label: "Affiliate", href: "/dashboard/account/affiliate" },
];

export function AccountSidebar() {
  const pathname = usePathname();
  return (
    <nav className="self-start bg-white rounded-xl shadow-sm border border-slate-200 p-2 md:p-3 md:sticky md:top-20">
      <ul className="flex md:flex-col gap-1 overflow-x-auto">
        {SECTIONS.map((s) => {
          const active = pathname?.startsWith(s.href);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                className={`block px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
