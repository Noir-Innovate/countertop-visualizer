"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  profile_id: string;
  sms_enabled: boolean;
  email_enabled: boolean;
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    phone: string | null;
    email?: string | null;
  };
}

interface NotificationListProps {
  materialLineId: string;
}

export default function NotificationList({
  materialLineId,
}: NotificationListProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, [materialLineId]);

  const fetchNotifications = async () => {
    try {
      const response = await fetch(
        `/api/material-lines/${materialLineId}/notifications`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch notifications");
      }

      setNotifications(data.notifications || []);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch notifications"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePreferences = async (
    notificationId: string,
    smsEnabled: boolean,
    emailEnabled: boolean
  ) => {
    setUpdatingId(notificationId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/material-lines/${materialLineId}/notifications?id=${notificationId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            smsEnabled,
            emailEnabled,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update notification");
      }

      setSuccess("Notification preferences updated successfully");
      router.refresh();
      fetchNotifications();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update notification"
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (notificationId: string) => {
    if (
      !confirm("Are you sure you want to remove this notification assignment?")
    ) {
      return;
    }

    setRemovingId(notificationId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/material-lines/${materialLineId}/notifications?id=${notificationId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove notification");
      }

      setSuccess("Notification assignment removed successfully");
      router.refresh();
      fetchNotifications();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove notification"
      );
    } finally {
      setRemovingId(null);
    }
  };

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

      {notifications.length === 0 ? (
        <div className="px-6 py-12 text-center bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-slate-500">
            No notification recipients assigned yet
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">
              Notification Recipients
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <div key={notification.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">
                      {notification.profiles.full_name || "Unnamed User"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {notification.profiles.email || "No email"}
                    </p>
                    {notification.profiles.phone && (
                      <p className="text-sm text-slate-500">
                        {notification.profiles.phone}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={notification.sms_enabled}
                          onChange={(e) =>
                            handleUpdatePreferences(
                              notification.id,
                              e.target.checked,
                              notification.email_enabled
                            )
                          }
                          disabled={updatingId === notification.id}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 disabled:opacity-50"
                        />
                        <span className="text-sm text-slate-700">SMS</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={notification.email_enabled}
                          onChange={(e) =>
                            handleUpdatePreferences(
                              notification.id,
                              notification.sms_enabled,
                              e.target.checked
                            )
                          }
                          disabled={updatingId === notification.id}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 disabled:opacity-50"
                        />
                        <span className="text-sm text-slate-700">Email</span>
                      </label>
                      {updatingId === notification.id && (
                        <span className="text-xs text-slate-500">
                          Updating...
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(notification.id)}
                    disabled={removingId === notification.id}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {removingId === notification.id ? "Removing..." : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
