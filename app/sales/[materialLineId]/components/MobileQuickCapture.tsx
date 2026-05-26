"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import type { Job } from "./JobsSidebar";
import type { Workspace } from "./WorkspacesHome";

export interface QuickCaptureResult {
  job: Job;
  workspace: Workspace;
  kitchenImageDataUrl: string;
  kitchenImagePath: string;
}

interface Props {
  materialLineId: string;
  onComplete: (result: QuickCaptureResult) => void;
}

interface NormalizedAddress {
  formatted: string;
  lat?: number;
  lng?: number;
}

const COMPRESS_OPTS = {
  maxSizeMB: 4,
  maxWidthOrHeight: 2560,
  useWebWorker: true,
  fileType: "image/jpeg" as const,
  initialQuality: 0.9,
};

async function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

async function getPositionSafe(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

export default function MobileQuickCapture({
  materialLineId,
  onComplete,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const [status, setStatus] = useState<
    | { phase: "idle" }
    | { phase: "working"; message: string }
    | { phase: "address"; defaultValue: string; reason?: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  const trigger = () => {
    if (status.phase === "working") return;
    fileInputRef.current?.click();
  };

  const resetCapture = () => {
    setStatus({ phase: "idle" });
    pendingDataRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    pendingFileRef.current = file;
    setStatus({ phase: "working", message: "Reading photo…" });
    try {
      const rawDataUrl = await readAsDataUrl(file);
      const compressedBlob = await imageCompression(file, COMPRESS_OPTS);
      const compressedDataUrl = await readAsDataUrl(compressedBlob);

      // GPS in parallel with the (already-finished) compression.
      setStatus({ phase: "working", message: "Locating…" });
      const pos = await getPositionSafe();
      let address: NormalizedAddress | null = null;
      if (pos) {
        try {
          const r = await fetch("/api/sales/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "reverse",
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          });
          if (r.ok) {
            const j = await r.json();
            address = j.address as NormalizedAddress;
          }
        } catch {
          // fall through; we'll prompt for address
        }
      }

      if (!address?.formatted) {
        setStatus({
          phase: "address",
          defaultValue: "",
          reason: pos
            ? "Couldn't look up that location."
            : "Location unavailable — type the address.",
        });
        // Stash the compressed data url so the address dialog can resume.
        pendingDataRef.current = { rawDataUrl, compressedDataUrl };
        return;
      }

      await finalize({
        rawDataUrl,
        compressedDataUrl,
        addressText: address.formatted,
        gpsLat: address.lat ?? pos?.coords.latitude ?? null,
        gpsLng: address.lng ?? pos?.coords.longitude ?? null,
      });
    } catch (e) {
      setStatus({
        phase: "error",
        message: e instanceof Error ? e.message : "Capture failed",
      });
    }
  };

  // Stash for the address-fallback path.
  const pendingDataRef = useRef<{
    rawDataUrl: string;
    compressedDataUrl: string;
  } | null>(null);

  const finalize = async (input: {
    rawDataUrl: string;
    compressedDataUrl: string;
    addressText: string;
    gpsLat: number | null;
    gpsLng: number | null;
  }) => {
    setStatus({ phase: "working", message: "Saving job…" });
    // 1. Create job (server also creates the default workspace).
    const jobRes = await fetch("/api/sales/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialLineId,
        address: input.addressText,
        gpsLat: input.gpsLat,
        gpsLng: input.gpsLng,
      }),
    });
    const jobJson = await jobRes.json();
    if (!jobRes.ok) {
      throw new Error(jobJson.error || "Failed to create job");
    }
    const job = jobJson.job as Job;
    const workspace = jobJson.workspace as Workspace | null;
    if (!workspace) {
      throw new Error("Workspace creation failed");
    }

    // 2. Upload the kitchen image under the workspace's session.
    setStatus({ phase: "working", message: "Uploading photo…" });
    const upRes = await fetch("/api/v2/upload-kitchen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageData: input.compressedDataUrl,
        sessionId: workspace.sessionId,
      }),
    });
    const upJson = await upRes.json();
    if (!upRes.ok) {
      throw new Error(upJson.error || "Photo upload failed");
    }
    const kitchenImagePath = upJson.storagePath as string;

    // 3. Persist the kitchen path on the workspace.
    await fetch(
      `/api/sales/jobs/${job.id}/workspaces/${workspace.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitchenImagePath }),
      },
    );

    // 4. Tell the shell to transition to Stage 2.
    onComplete({
      job,
      workspace: { ...workspace, kitchenImagePath },
      kitchenImageDataUrl: input.compressedDataUrl,
      kitchenImagePath,
    });
    setStatus({ phase: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
    pendingFileRef.current = null;
    pendingDataRef.current = null;
  };

  const submitAddress = async (addressText: string) => {
    const trimmed = addressText.trim();
    if (!trimmed) {
      setStatus({
        phase: "address",
        defaultValue: addressText,
        reason: "Address can't be empty.",
      });
      return;
    }
    const pending = pendingDataRef.current;
    if (!pending) {
      setStatus({ phase: "error", message: "Photo missing — try again." });
      return;
    }
    try {
      await finalize({
        rawDataUrl: pending.rawDataUrl,
        compressedDataUrl: pending.compressedDataUrl,
        addressText: trimmed,
        gpsLat: null,
        gpsLng: null,
      });
    } catch (e) {
      setStatus({
        phase: "error",
        message: e instanceof Error ? e.message : "Failed to save job",
      });
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            try {
              await handleFile(file);
            } catch (err) {
              setStatus({
                phase: "error",
                message: err instanceof Error ? err.message : "Capture failed",
              });
            }
          }
        }}
      />

      <button
        type="button"
        onClick={trigger}
        aria-label="Quick capture"
        className="lg:hidden fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center active:scale-95 transition-transform"
      >
        <svg
          className="w-7 h-7"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {status.phase === "working" && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-xl px-6 py-5 shadow-xl flex items-center gap-3">
            <svg
              className="animate-spin w-5 h-5 text-blue-600"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                className="opacity-25"
              />
              <path
                d="M4 12a8 8 0 018-8"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-sm font-medium text-slate-900">
              {status.message}
            </span>
          </div>
        </div>
      )}

      {status.phase === "address" && (
        <AddressFallback
          defaultValue={status.defaultValue}
          reason={status.reason}
          onCancel={resetCapture}
          onSubmit={submitAddress}
        />
      )}

      {status.phase === "error" && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-xl max-w-sm w-full p-5">
            <p className="text-sm text-red-700 mb-4">{status.message}</p>
            <div className="flex justify-end">
              <button
                onClick={resetCapture}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddressFallback({
  defaultValue,
  reason,
  onCancel,
  onSubmit,
}: {
  defaultValue: string;
  reason?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">
            Where is this job?
          </h3>
          {reason && <p className="text-xs text-slate-500 mt-1">{reason}</p>}
        </div>
        <form
          className="p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(value);
          }}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            placeholder="123 Main St, Springfield"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              Save & continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
