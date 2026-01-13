"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  profile_id: string;
  role: string;
  profiles: {
    id: string;
    full_name: string | null;
    email?: string;
  };
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
}

interface MemberListProps {
  orgId: string;
  members: Member[];
  invitations: Invitation[];
  currentUserId: string;
  currentUserRole: string;
}

export default function MemberList({
  orgId,
  members,
  invitations,
  currentUserId,
  currentUserRole,
}: MemberListProps) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [deletingInvitationId, setDeletingInvitationId] = useState<
    string | null
  >(null);
  const [resendingInvitationId, setResendingInvitationId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  const handleRemove = async (
    memberId: string,
    memberRole: string,
    memberProfileId: string
  ) => {
    if (
      !confirm(
        "Are you sure you want to remove this member from the organization?"
      )
    ) {
      return;
    }

    // Prevent removing yourself if you're the owner
    if (memberProfileId === currentUserId && memberRole === "owner") {
      setError("You cannot remove yourself as the owner");
      return;
    }

    setRemovingId(memberId);
    setError(null);

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/members/${memberId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove member");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  };

  const handleDeleteInvitation = async (invitationId: string) => {
    if (!confirm("Are you sure you want to delete this invitation?")) {
      return;
    }

    setDeletingInvitationId(invitationId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/invitations/${invitationId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete invitation");
      }

      setSuccess("Invitation deleted successfully");
      router.refresh();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete invitation"
      );
    } finally {
      setDeletingInvitationId(null);
    }
  };

  const handleUpdateRole = async (
    memberId: string,
    newRole: string,
    currentRole: string,
    memberProfileId: string
  ) => {
    // Prevent changing your own role from owner
    if (
      memberProfileId === currentUserId &&
      currentRole === "owner" &&
      newRole !== "owner"
    ) {
      setError("You cannot change your own role from owner");
      return;
    }

    setUpdatingRoleId(memberId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/members/${memberId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: newRole }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update role");
      }

      setSuccess("Role updated successfully");
      router.refresh();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    setResendingInvitationId(invitationId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/invitations/${invitationId}`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend invitation");
      }

      setSuccess("Invitation resent successfully");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to resend invitation"
      );
    } finally {
      setResendingInvitationId(null);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-purple-100 text-purple-700";
      case "admin":
        return "bg-blue-100 text-blue-700";
      case "sales_person":
        return "bg-green-100 text-green-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const formatRole = (role: string) => {
    return role
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Members List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Team Members</h3>
        </div>

        {members.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500">
            No members yet. Invite someone to get started!
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {members.map((member) => {
              const isCurrentUser = member.profile_id === currentUserId;
              const canRemove =
                canManage && !(isCurrentUser && member.role === "owner");

              return (
                <div
                  key={member.id}
                  className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                      {(
                        member.profiles.full_name ||
                        member.profiles.email ||
                        "U"
                      )
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {member.profiles.full_name ||
                          member.profiles.email ||
                          "Unknown User"}
                        {isCurrentUser && (
                          <span className="ml-2 text-sm text-slate-500">
                            (You)
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-slate-500">
                        {member.profiles.email || "No email"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {canManage && !isCurrentUser ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleUpdateRole(
                            member.id,
                            e.target.value,
                            member.role,
                            member.profile_id
                          )
                        }
                        disabled={updatingRoleId === member.id}
                        className={`px-2 py-1 text-xs font-medium rounded-full border-0 focus:ring-2 focus:ring-blue-500 ${getRoleBadgeColor(
                          member.role
                        )} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <option value="member">Member</option>
                        <option value="sales_person">Sales Person</option>
                        <option value="admin">Admin</option>
                        {currentUserRole === "owner" && (
                          <option value="owner">Owner</option>
                        )}
                      </select>
                    ) : (
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(
                          member.role
                        )}`}
                      >
                        {formatRole(member.role)}
                      </span>
                    )}
                    {canRemove && (
                      <button
                        onClick={() =>
                          handleRemove(
                            member.id,
                            member.role,
                            member.profile_id
                          )
                        }
                        disabled={removingId === member.id}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {removingId === member.id ? "Removing..." : "Remove"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">
              Pending Invitations
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {invitations.map((invitation) => {
              const isExpired = new Date(invitation.expires_at) < new Date();

              return (
                <div
                  key={invitation.id}
                  className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {invitation.email}
                    </p>
                    <p className="text-sm text-slate-500">
                      Expires{" "}
                      {new Date(invitation.expires_at).toLocaleDateString()}
                      {isExpired && (
                        <span className="ml-2 text-red-600">(Expired)</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(
                        invitation.role
                      )}`}
                    >
                      {formatRole(invitation.role)}
                    </span>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResendInvitation(invitation.id)}
                          disabled={resendingInvitationId === invitation.id}
                          className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Resend invitation email"
                        >
                          {resendingInvitationId === invitation.id
                            ? "Sending..."
                            : "Resend"}
                        </button>
                        <button
                          onClick={() => handleDeleteInvitation(invitation.id)}
                          disabled={deletingInvitationId === invitation.id}
                          className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Delete invitation"
                        >
                          {deletingInvitationId === invitation.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
