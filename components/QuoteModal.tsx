"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { trackEvent } from "@/lib/posthog";
import PhoneVerificationModal from "@/components/PhoneVerificationModal";
import { setVerifiedPhone } from "@/lib/ab-testing";
import type { LeadFormData } from "@/lib/types";

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSlabId: string | null;
  selectedSlabName: string | null;
  selectedImageUrl: string | null;
  verifiedPhone: string | null;
  abVariant: string;
  onSubmitSuccess: () => void;
}

export default function QuoteModal({
  isOpen,
  onClose,
  selectedSlabId,
  selectedSlabName,
  selectedImageUrl,
  verifiedPhone,
  abVariant,
  onSubmitSuccess,
}: QuoteModalProps) {
  const [step, setStep] = useState<'verify' | 'form'>('verify');
  const [currentVerifiedPhone, setCurrentVerifiedPhone] = useState<string | null>(verifiedPhone);
  const [formData, setFormData] = useState<LeadFormData>({
    name: "",
    email: "",
    address: "",
    phone: verifiedPhone || "",
    smsNotifications: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      if (verifiedPhone) {
        setStep('form');
        setCurrentVerifiedPhone(verifiedPhone);
        setFormData(prev => ({ ...prev, phone: verifiedPhone }));
      } else {
        setStep('verify');
        setCurrentVerifiedPhone(null);
      }
      setSuccess(false);
      setError(null);
    }
  }, [isOpen, verifiedPhone]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setError(null);
  };

  const handleVerified = (phone: string) => {
    setCurrentVerifiedPhone(phone);
    setVerifiedPhone(phone);
    setFormData(prev => ({ ...prev, phone }));
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Require phone verification
    if (!currentVerifiedPhone) {
      setError("Please verify your phone number first");
      setStep('verify');
      return;
    }

    // Validation
    if (!formData.name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!formData.email.trim() || !formData.email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    if (!formData.address.trim()) {
      setError("Please enter your address");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    trackEvent("lead_form_submitted", {
      selectedSlab: selectedSlabName,
      hasPhone: !!formData.phone,
    });

    try {
      const response = await fetch("/api/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          selectedSlabId,
          selectedSlabName,
          selectedImageUrl,
          abVariant,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit");
      }

      trackEvent("lead_submission_successful");
      setSuccess(true);
      setTimeout(() => {
        onSubmitSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      trackEvent("lead_submission_failed");
      setError(
        err instanceof Error
          ? err.message
          : "Failed to submit. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Show phone verification first if not verified
  if (step === 'verify') {
    return (
      <PhoneVerificationModal
        isOpen={isOpen}
        onClose={onClose}
        onVerified={handleVerified}
        autoClose={false}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 animate-fade-in overflow-y-auto"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full h-full md:h-auto md:max-w-lg bg-white md:rounded-2xl shadow-2xl overflow-hidden animate-scale-in md:my-8 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-[var(--color-text-secondary)] shadow-lg transition-colors z-10"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[var(--color-success)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-[var(--color-text)] mb-2">
              Thank You!
            </h3>
            <p className="text-[var(--color-text-secondary)]">
              Our team will be in touch with you shortly. Check your phone for a
              confirmation message!
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full md:h-auto flex-1">
            {/* Image Section */}
            {selectedImageUrl && (
              <div className="relative w-full aspect-video flex-shrink-0">
                <Image
                  src={selectedImageUrl}
                  alt={selectedSlabName || "Selected countertop"}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 32rem"
                />
                {selectedSlabName && (
                  <div className="absolute top-3 left-3 px-3 py-1 bg-[var(--color-accent)] text-white text-sm font-medium rounded-full z-10">
                    {selectedSlabName}
                  </div>
                )}
              </div>
            )}

            {/* Form Section */}
            <div className="bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] p-6 md:p-8 text-white flex flex-col flex-1 min-h-0 overflow-y-auto">
              <div className="mb-6">
                <h3 className="text-2xl font-bold mb-2">Get Your Quote</h3>
                <p className="text-white/80">
                  {selectedSlabName
                    ? `Get a quote for ${selectedSlabName} countertops`
                    : "Get a quote for your dream countertops"}
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-4 flex-1 flex flex-col"
              >
                <div>
                  <label
                    htmlFor="quote-name"
                    className="block text-sm font-medium text-white/90 mb-1"
                  >
                    Full Name *
                  </label>
                  <input
                    type="text"
                    id="quote-name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Smith"
                    className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label
                    htmlFor="quote-email"
                    className="block text-sm font-medium text-white/90 mb-1"
                  >
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="quote-email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="john@example.com"
                    className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label
                    htmlFor="quote-phone"
                    className="block text-sm font-medium text-white/90 mb-1"
                  >
                    Phone Number *
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      id="quote-phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="(555) 555-5555"
                      className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all pr-20"
                      disabled={isSubmitting || !!currentVerifiedPhone}
                      required
                    />
                    {currentVerifiedPhone && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-[var(--color-success)]">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Verified
                      </div>
                    )}
                  </div>
                  {!currentVerifiedPhone && (
                    <button
                      type="button"
                      onClick={() => setStep('verify')}
                      className="mt-2 text-sm text-white/80 hover:text-white underline"
                    >
                      Verify phone number
                    </button>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="quote-address"
                    className="block text-sm font-medium text-white/90 mb-1"
                  >
                    Project Address *
                  </label>
                  <input
                    type="text"
                    id="quote-address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="123 Main St, City, State 12345"
                    className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="quote-sms-notifications"
                    name="smsNotifications"
                    checked={formData.smsNotifications || false}
                    onChange={handleChange}
                    className="mt-1 w-5 h-5 rounded border-white/20 bg-white/10 text-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-0 cursor-pointer"
                    disabled={isSubmitting}
                  />
                  <label
                    htmlFor="quote-sms-notifications"
                    className="text-sm text-white/90 cursor-pointer"
                  >
                    I agree to receive SMS notifications regarding my quote
                  </label>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/20 border border-red-400/30 rounded-lg">
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                )}

                <div className="mt-auto pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <svg
                          className="animate-spin h-5 w-5"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Submitting...
                      </>
                    ) : (
                      <>
                        Get My Quote
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
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      </>
                    )}
                  </button>

                  {/* <p className="text-center text-xs text-white/60 mt-3">
                    By submitting, you agree to be contacted about your project.
                  </p> */}
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
