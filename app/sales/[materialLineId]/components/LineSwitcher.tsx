"use client";

import { useRouter } from "next/navigation";

export interface AssignedLineOption {
  id: string;
  name: string;
  line_kind: "internal" | "external";
  organization_name: string;
}

interface Props {
  current: string;
  lines: AssignedLineOption[];
}

export default function LineSwitcher({ current, lines }: Props) {
  const router = useRouter();

  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-slate-400 px-1">
        Line
      </span>
      <select
        value={current}
        onChange={(e) => {
          if (e.target.value !== current) router.push(`/sales/${e.target.value}`);
        }}
        className="mt-1 w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {lines.length === 0 && <option value="">—</option>}
        {lines.map((line) => (
          <option key={line.id} value={line.id}>
            {line.organization_name
              ? `${line.name} — ${line.organization_name}`
              : line.name}
          </option>
        ))}
      </select>
    </label>
  );
}
