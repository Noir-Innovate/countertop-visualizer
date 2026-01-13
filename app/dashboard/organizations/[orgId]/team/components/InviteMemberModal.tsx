"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InviteMemberForm from "./InviteMemberForm";

interface InviteMemberModalProps {
  orgId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function InviteMemberModal({
  orgId,
  isOpen,
  onClose,
}: InviteMemberModalProps) {
  const router = useRouter();
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSuccess = () => {
    setSuccess(true);
    router.refresh();
    // Close modal after a short delay to show success message
    setTimeout(() => {
      setSuccess(false);
      onClose();
    }, 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Invite Team Member
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close modal"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-6">
          <InviteMemberForm orgId={orgId} onSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  );
}
