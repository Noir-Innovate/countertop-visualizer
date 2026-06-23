"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  orgId: string;
  materialLineId: string;
  profileId: string;
  name: string;
}

export default function RemoveSalespersonButton({
  orgId,
  materialLineId,
  profileId,
  name,
}: Props) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);

  const remove = async () => {
    if (
      !window.confirm(
        `Remove ${name} from this line? They'll lose access to it but remain in the organization.`,
      )
    ) {
      return;
    }
    setIsRemoving(true);
    try {
      const res = await fetch(
        `/api/organizations/${orgId}/material-lines/${materialLineId}/salespeople`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove salesperson");
      }
      router.refresh();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to remove salesperson",
      );
      setIsRemoving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={remove}
      disabled={isRemoving}
      className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
    >
      {isRemoving ? "Removing…" : "Remove"}
    </button>
  );
}
