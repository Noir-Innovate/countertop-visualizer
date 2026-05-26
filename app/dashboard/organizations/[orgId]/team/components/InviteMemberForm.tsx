"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface InviteMemberFormProps {
  orgId: string;
  onSuccess?: () => void;
}

interface OrgMaterialLine {
  id: string;
  name: string;
  line_kind: "external" | "internal";
}

export default function InviteMemberForm({
  orgId,
  onSuccess,
}: InviteMemberFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<
    "owner" | "admin" | "member" | "sales_person"
  >("member");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lines, setLines] = useState<OrgMaterialLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());

  // Lazy-load the org's material lines when role becomes sales_person.
  useEffect(() => {
    if (role !== "sales_person" || lines.length > 0) return;
    let cancelled = false;
    setLinesLoading(true);
    const supabase = createClient();
    supabase
      .from("material_lines")
      .select("id, name, line_kind")
      .eq("organization_id", orgId)
      .order("name")
      .then(({ data }) => {
        if (cancelled) return;
        setLines((data as OrgMaterialLine[]) || []);
        setLinesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, orgId, lines.length]);

  const toggleLine = (id: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (role === "sales_person" && selectedLineIds.size === 0) {
      setError("Select at least one material line to assign this salesperson to.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/organizations/${orgId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role,
          assignedMaterialLineIds:
            role === "sales_person" ? Array.from(selectedLineIds) : [],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invitation");
      }

      setSuccess(`Invitation sent to ${email}`);
      setEmail("");
      setRole("member");
      setSelectedLineIds(new Set());
      router.refresh();

      if (onSuccess) {
        onSuccess();
      } else {
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send invitation",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <div className="space-y-4">
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
            placeholder="colleague@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="role"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) =>
              setRole(
                e.target.value as "owner" | "admin" | "member" | "sales_person",
              )
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="member">Member</option>
            <option value="sales_person">Sales Person</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {role === "owner" &&
              "Full access, can manage owners and all settings"}
            {role === "admin" && "Can manage team members and material lines"}
            {role === "sales_person" &&
              "Limited to the /sales portal for assigned material lines"}
            {role === "member" && "Can view organization content"}
          </p>
        </div>

        {role === "sales_person" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Assigned Material Lines
            </label>
            <p className="text-xs text-slate-500 mb-2">
              The salesperson will only see and create jobs for these lines.
            </p>
            {linesLoading ? (
              <p className="text-sm text-slate-500">Loading lines…</p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-slate-500">
                This organization has no material lines yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2">
                {lines.map((line) => (
                  <label
                    key={line.id}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLineIds.has(line.id)}
                      onChange={() => toggleLine(line.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">{line.name}</span>
                    {line.line_kind === "internal" && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        internal
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !email}
          className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Sending..." : "Send Invitation"}
        </button>
      </div>
    </form>
  );
}
