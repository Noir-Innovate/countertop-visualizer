"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface InviteMemberFormProps {
  orgId: string;
  onSuccess?: () => void;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/organizations/${orgId}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invitation");
      }

      setSuccess(`Invitation sent to ${email}`);
      setEmail("");
      setRole("member");
      router.refresh();

      // Call onSuccess callback if provided (for modal)
      if (onSuccess) {
        onSuccess();
      } else {
        // Clear success message after 3 seconds if not in modal
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
            {role === "sales_person" && "Can view and manage leads"}
            {role === "member" && "Can view organization content"}
          </p>
        </div>

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
