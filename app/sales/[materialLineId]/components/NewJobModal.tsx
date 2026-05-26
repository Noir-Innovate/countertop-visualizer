"use client";

import { useEffect, useRef, useState } from "react";
import { uuidv4 } from "@/lib/uuid";
import type { Job } from "./JobsSidebar";
import type { Workspace } from "./WorkspacesHome";

interface Props {
  materialLineId: string;
  /** When provided, modal is in edit mode and PATCHes this job. */
  existingJob?: Job;
  onClose: () => void;
  /** Create returns workspace too; edit returns workspace=null. */
  onSaved: (result: { job: Job; workspace: Workspace | null }) => void;
}

interface Prediction {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
}

interface NormalizedAddress {
  formatted: string;
  lat?: number;
  lng?: number;
}

export default function NewJobModal({
  materialLineId,
  existingJob,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!existingJob;
  const [address, setAddress] = useState(existingJob?.address || "");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(
    existingJob?.gps_lat != null && existingJob?.gps_lng != null
      ? { lat: existingJob.gps_lat, lng: existingJob.gps_lng }
      : null,
  );
  const [name, setName] = useState(existingJob?.name || "");
  const [email, setEmail] = useState(existingJob?.email || "");
  const [phone, setPhone] = useState(existingJob?.phone || "");
  const [notes, setNotes] = useState(existingJob?.notes || "");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(isEdit && (!!existingJob?.email || !!existingJob?.phone || !!existingJob?.notes));
  const nameRef = useRef<HTMLInputElement>(null);
  const sessionTokenRef = useRef<string>(uuidv4());
  const reqIdRef = useRef(0);
  const skipAutocompleteRef = useRef(false);

  // Debounced autocomplete on address input.
  useEffect(() => {
    if (skipAutocompleteRef.current) {
      skipAutocompleteRef.current = false;
      return;
    }
    const term = address.trim();
    if (term.length < 3) {
      setPredictions([]);
      return;
    }
    const id = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch("/api/sales/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "autocomplete",
            query: term,
            sessionToken: sessionTokenRef.current,
          }),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (id !== reqIdRef.current) return;
        setPredictions((json.predictions as Prediction[]) || []);
      } catch {
        // ignore network errors here
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [address]);

  const requestLocation = async (silent: boolean) => {
    if (!navigator.geolocation) {
      if (!silent) setError("Geolocation is not available on this device.");
      return;
    }
    setLocating(true);
    if (!silent) setError(null);
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          }),
      );
      const { latitude, longitude } = position.coords;
      const res = await fetch("/api/sales/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "reverse", lat: latitude, lng: longitude }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Reverse geocoding failed");
      }
      const a = json.address as NormalizedAddress;
      skipAutocompleteRef.current = true;
      setAddress(a.formatted || `${latitude},${longitude}`);
      setGps({ lat: a.lat ?? latitude, lng: a.lng ?? longitude });
      setPredictions([]);
      // Auto-focus the customer name now that address is filled.
      requestAnimationFrame(() => nameRef.current?.focus());
    } catch (e) {
      if (!silent) {
        setError(
          e instanceof Error ? e.message : "Could not determine your location.",
        );
      }
    } finally {
      setLocating(false);
    }
  };

  // On open (create mode only, and only if the form is empty) try to auto-fill
  // the address from the browser's geolocation. Edit mode never auto-locates.
  useEffect(() => {
    if (isEdit) return;
    if (address.trim().length > 0) return;
    requestLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClearAddress = () => {
    skipAutocompleteRef.current = true;
    setAddress("");
    setGps(null);
    setPredictions([]);
  };

  const handlePickPrediction = async (p: Prediction) => {
    skipAutocompleteRef.current = true;
    setAddress(p.description);
    setShowPredictions(false);
    setPredictions([]);
    try {
      const res = await fetch("/api/sales/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "place_details",
          placeId: p.placeId,
          sessionToken: sessionTokenRef.current,
        }),
      });
      const json = await res.json();
      if (!res.ok) return;
      const a = json.address as NormalizedAddress;
      if (a.lat != null && a.lng != null) setGps({ lat: a.lat, lng: a.lng });
      if (a.formatted) {
        skipAutocompleteRef.current = true;
        setAddress(a.formatted);
      }
    } finally {
      sessionTokenRef.current = uuidv4();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!address.trim()) {
      setError("Address is required.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        materialLineId,
        address: address.trim(),
        customerName: name.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        gpsLat: gps?.lat ?? null,
        gpsLng: gps?.lng ?? null,
      };
      const res = await fetch(
        isEdit ? `/api/sales/jobs/${existingJob!.id}` : "/api/sales/jobs",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Failed to ${isEdit ? "update" : "create"} job`);
      }
      onSaved({
        job: json.job as Job,
        workspace: (json.workspace as Workspace | undefined) ?? null,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${isEdit ? "update" : "create"} job`,
      );
    } finally {
      setSubmitting(false);
    }
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
            {isEdit ? "Edit Job" : "New Job"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600"
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="address"
                className="block text-sm font-medium text-slate-700"
              >
                Address
              </label>
              <button
                type="button"
                onClick={() => requestLocation(false)}
                disabled={locating}
                className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {locating ? "Locating…" : "Use my location"}
              </button>
            </div>
            <div className="relative">
              <input
                id="address"
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setGps(null);
                  setShowPredictions(true);
                }}
                onFocus={() => setShowPredictions(true)}
                required
                className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="123 Main St, Springfield, IL"
              />
              {address && (
                <button
                  type="button"
                  onClick={handleClearAddress}
                  aria-label="Clear address"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <svg
                    className="w-4 h-4"
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
              )}
              {showPredictions && predictions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {predictions.map((p) => (
                    <li key={p.placeId}>
                      <button
                        type="button"
                        onClick={() => handlePickPrediction(p)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      >
                        <p className="text-sm text-slate-900">
                          {p.mainText || p.description}
                        </p>
                        {p.secondaryText && (
                          <p className="text-xs text-slate-500">
                            {p.secondaryText}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {gps && (
              <p className="mt-1 text-xs text-slate-500">
                GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Customer name
            </label>
            <input
              ref={nameRef}
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Jane Smith"
            />
          </div>

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <svg
              className={`w-4 h-4 transition-transform ${moreOpen ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            More info
          </button>

          {moreOpen && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Phone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(555) 555-5555"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="notes"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Kitchen reno, decision maker is the spouse, etc."
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !address.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting
                ? "Saving…"
                : isEdit
                  ? "Save Changes"
                  : "Save Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
