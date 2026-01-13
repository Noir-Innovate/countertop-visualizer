"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface OrganizationMember {
  id: string;
  profile_id: string;
  role: string;
  profiles: {
    id: string;
    full_name: string | null;
    email?: string;
  };
}

interface Notification {
  id: string;
  profile_id: string;
}

interface NotificationFormProps {
  materialLineId: string;
  orgId: string;
  existingNotifications: Notification[];
  onSuccess?: () => void;
}

export default function NotificationForm({
  materialLineId,
  orgId,
  existingNotifications,
  onSuccess,
}: NotificationFormProps) {
  const router = useRouter();
  const [availableMembers, setAvailableMembers] = useState<
    OrganizationMember[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchAvailableMembers();
  }, [orgId]);

  const fetchAvailableMembers = async () => {
    try {
      const response = await fetch(`/api/organizations/${orgId}/members`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch members");
      }

      // Filter to only owners, admins, and salespeople
      const eligibleMembers = (data.members || []).filter(
        (member: OrganizationMember) =>
          member.role === "owner" ||
          member.role === "admin" ||
          member.role === "sales_person"
      );

      setAvailableMembers(eligibleMembers);
    } catch (err) {
      console.error("Error fetching members:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProfileId) {
      setError("Please select a team member");
      return;
    }

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/material-lines/${materialLineId}/notifications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            profileId: selectedProfileId,
            smsEnabled,
            emailEnabled,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add notification");
      }

      setSuccess("Notification assignment added successfully");
      setSelectedProfileId("");
      setSmsEnabled(false);
      setEmailEnabled(true);
      router.refresh();

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add notification"
      );
    } finally {
      setAdding(false);
    }
  };

  // Filter out members who are already assigned
  const unassignedMembers = availableMembers.filter(
    (member) =>
      !existingNotifications.some((n) => n.profile_id === member.profile_id)
  );

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-32 bg-slate-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}

      {/* Add Notification Form */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-4">
          Add Notification Recipient
        </h3>

        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label
              htmlFor="member"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Team Member
            </label>
            <select
              id="member"
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
            >
              <option value="">Select a team member...</option>
              {unassignedMembers.map((member) => (
                <option key={member.id} value={member.profile_id}>
                  {member.profiles.full_name || "Unnamed User"} ({member.role})
                </option>
              ))}
            </select>
            {unassignedMembers.length === 0 && (
              <p className="mt-1 text-sm text-slate-500">
                All eligible team members are already assigned
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Notification Methods
            </label>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => setSmsEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">SMS</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Email</span>
              </label>
            </div>
            {!smsEnabled && !emailEnabled && (
              <p className="text-sm text-amber-600">
                At least one notification method must be enabled
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={
              adding || !selectedProfileId || (!smsEnabled && !emailEnabled)
            }
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {adding ? "Adding..." : "Add Notification"}
          </button>
        </form>
      </div>
    </div>
  );
}
