"use client";

import { useState, useRef, useEffect } from "react";
import { trackEvent } from "@/lib/posthog";
import { getVerifiedPhone, setVerifiedPhone } from "@/lib/ab-testing";

interface PhoneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (phone: string) => void;
  autoClose?: boolean; // If false, won't auto-close after verification (for multi-step flows)
}

type Step = "phone" | "code" | "success";

export default function PhoneVerificationModal({
  isOpen,
  onClose,
  onVerified,
  autoClose = true,
}: PhoneVerificationModalProps) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  // Check if phone is already verified when modal opens
  useEffect(() => {
    if (isOpen) {
      const verifiedPhone = getVerifiedPhone();
      if (verifiedPhone) {
        // Phone is already verified, notify parent and close
        onVerified(verifiedPhone);
        if (autoClose) {
          onClose();
        }
        return;
      }
      // Reset state for new verification
      setStep("phone");
      setPhone("");
      setCode(["", "", "", "", "", ""]);
      setError(null);
    }
  }, [isOpen, onVerified, onClose, autoClose]);

  // Format phone number as user types
  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");

    // Limit to 10 digits
    const limitedDigits = digits.slice(0, 10);

    // Format based on length
    if (limitedDigits.length === 0) return "";
    if (limitedDigits.length <= 3) return limitedDigits;
    if (limitedDigits.length <= 6) {
      return `(${limitedDigits.slice(0, 3)}) ${limitedDigits.slice(3)}`;
    }
    return `(${limitedDigits.slice(0, 3)}) ${limitedDigits.slice(
      3,
      6
    )}-${limitedDigits.slice(6)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const formatted = formatPhoneNumber(inputValue);
    setPhone(formatted);
    setError(null);
  };

  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow backspace, delete, tab, escape, enter, and arrow keys
    if (
      [8, 9, 27, 13, 46, 37, 38, 39, 40].indexOf(e.keyCode) !== -1 ||
      // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
      (e.keyCode === 65 && e.ctrlKey === true) ||
      (e.keyCode === 67 && e.ctrlKey === true) ||
      (e.keyCode === 86 && e.ctrlKey === true) ||
      (e.keyCode === 88 && e.ctrlKey === true)
    ) {
      return;
    }
    // Ensure that it is a number and stop the keypress
    if (
      (e.shiftKey || e.keyCode < 48 || e.keyCode > 57) &&
      (e.keyCode < 96 || e.keyCode > 105)
    ) {
      e.preventDefault();
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, "").slice(0, 6);
      const newCode = [...code];
      for (let i = 0; i < digits.length; i++) {
        if (index + i < 6) {
          newCode[index + i] = digits[i];
        }
      }
      setCode(newCode);
      // Focus last filled input or next empty one
      const nextIndex = Math.min(index + digits.length, 5);
      codeInputsRef.current[nextIndex]?.focus();
    } else {
      const newCode = [...code];
      newCode[index] = value.replace(/\D/g, "");
      setCode(newCode);

      // Auto-focus next input
      if (value && index < 5) {
        codeInputsRef.current[index + 1]?.focus();
      }
    }
    setError(null);
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      codeInputsRef.current[index - 1]?.focus();
    }
  };

  const handleSendCode = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    setIsLoading(true);
    setError(null);
    trackEvent("verification_code_requested", { phone: digits });

    try {
      const response = await fetch("/api/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+1${digits}` }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send code");
      }

      setStep("code");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send verification code"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setIsLoading(true);
    setError(null);
    trackEvent("verification_code_submitted");

    try {
      const digits = phone.replace(/\D/g, "");
      const response = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: `+1${digits}`,
          code: fullCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invalid code");
      }

      trackEvent("verification_successful");

      // Save verified phone to localStorage
      const verifiedPhoneNumber = `+1${digits}`;
      setVerifiedPhone(verifiedPhoneNumber);

      setStep("success");

      // After a brief delay, notify parent and optionally close
      setTimeout(() => {
        onVerified(verifiedPhoneNumber);
        if (autoClose) {
          onClose();
        }
      }, 1500);
    } catch (err) {
      trackEvent("verification_failed");
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-bg-secondary)] hover:bg-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors"
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

        <div className="p-6 pt-8">
          {/* Phone Input Step */}
          {step === "phone" && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-[var(--color-accent)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
                Verify Your Phone Number
              </h2>
              <p className="text-[var(--color-text-secondary)] mb-6">
                We'll send you a verification code to confirm your phone number
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--color-text)] text-left mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] pointer-events-none z-10 font-medium">
                    +1
                  </span>
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    onKeyDown={handlePhoneKeyDown}
                    placeholder="(555) 555-5555"
                    className="input pr-4"
                    maxLength={14}
                    autoComplete="tel"
                    inputMode="tel"
                    style={{ paddingLeft: "2.75rem" }}
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-[var(--color-error)] mb-4">
                  {error}
                </p>
              )}

              <button
                onClick={handleSendCode}
                disabled={isLoading || phone.replace(/\D/g, "").length !== 10}
                className="w-full btn btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
                    Sending...
                  </span>
                ) : (
                  "Send Verification Code"
                )}
              </button>

              <p className="mt-4 text-xs text-[var(--color-text-muted)]">
                By continuing, you agree to receive SMS messages. Standard rates
                may apply.
              </p>
            </div>
          )}

          {/* Code Input Step */}
          {step === "code" && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-[var(--color-accent)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
                Enter Verification Code
              </h2>
              <p className="text-[var(--color-text-secondary)] mb-6">
                We sent a 6-digit code to {phone}
              </p>

              <div className="flex justify-center gap-2 mb-4">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      codeInputsRef.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(index, e)}
                    className="w-12 h-14 text-center text-2xl font-bold rounded-lg border-2 border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 outline-none transition-all"
                    maxLength={6}
                  />
                ))}
              </div>

              {error && (
                <p className="text-sm text-[var(--color-error)] mb-4">
                  {error}
                </p>
              )}

              <button
                onClick={handleVerifyCode}
                disabled={isLoading || code.join("").length !== 6}
                className="w-full btn btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
                    Verifying...
                  </span>
                ) : (
                  "Verify Code"
                )}
              </button>

              <button
                onClick={() => setStep("phone")}
                className="mt-3 text-sm text-[var(--color-accent)] hover:underline"
              >
                Use a different number
              </button>
            </div>
          )}

          {/* Success Step */}
          {step === "success" && (
            <div className="text-center py-4">
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

              <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
                Verified!
              </h2>
              <p className="text-[var(--color-text-secondary)]">
                Your phone number has been verified. You can now continue with
                your quote request.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
