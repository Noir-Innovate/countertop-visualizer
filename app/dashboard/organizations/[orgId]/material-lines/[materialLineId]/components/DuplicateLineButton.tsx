"use client";

import { useState } from "react";
import DuplicateLineModal from "./DuplicateLineModal";

interface DuplicateLineButtonProps {
  materialLineId: string;
  sourceOrgId: string;
  currentSlug: string;
  currentName: string;
}

export default function DuplicateLineButton({
  materialLineId,
  sourceOrgId,
  currentSlug,
  currentName,
}: DuplicateLineButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
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
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        Duplicate
      </button>
      <DuplicateLineModal
        materialLineId={materialLineId}
        sourceOrgId={sourceOrgId}
        currentSlug={currentSlug}
        currentName={currentName}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
