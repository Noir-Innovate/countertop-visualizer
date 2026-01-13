"use client";

import { useState, useEffect } from "react";
import NotificationModal from "./NotificationModal";

interface Notification {
  id: string;
  profile_id: string;
}

interface NotificationButtonProps {
  materialLineId: string;
  orgId: string;
}

export default function NotificationButton({
  materialLineId,
  orgId,
}: NotificationButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [existingNotifications, setExistingNotifications] = useState<
    Notification[]
  >([]);

  useEffect(() => {
    if (isModalOpen) {
      fetchNotifications();
    }
  }, [isModalOpen, materialLineId]);

  const fetchNotifications = async () => {
    try {
      const response = await fetch(
        `/api/material-lines/${materialLineId}/notifications`
      );
      const data = await response.json();

      if (response.ok && data.notifications) {
        setExistingNotifications(
          data.notifications.map((n: any) => ({
            id: n.id,
            profile_id: n.profile_id,
          }))
        );
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
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
        Add Notification
      </button>
      <NotificationModal
        materialLineId={materialLineId}
        orgId={orgId}
        existingNotifications={existingNotifications}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
