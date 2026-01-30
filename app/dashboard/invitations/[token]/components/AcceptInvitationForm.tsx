"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Organization {
  id: string;
  name: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  is_expired: boolean;
  is_accepted: boolean;
  organizations: Organization;
}

interface AcceptInvitationFormProps {
  invitation: Invitation;
  token: string;
  userEmail: string | null;
}

export default function AcceptInvitationForm({
  invitation,
  token,
  userEmail,
}: AcceptInvitationFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsSigningUp(true);

    try {
      const supabase = createClient();
      const { data: signupData, error: signupError } =
        await supabase.auth.signUp({
          email: invitation.email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard/invitations/${token}`,
          },
        });

      if (signupError) {
        throw new Error(signupError.message);
      }

      // If email confirmation is required, show message
      if (signupData.user && !signupData.session) {
        setError(null);
        // Show success message about email confirmation
        alert(
          "Please check your email to confirm your account, then return to this page to accept the invitation.",
        );
        return;
      }

      // If session is created immediately, accept invitation
      if (signupData.session) {
        await handleAcceptInvitation();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
      setIsSigningUp(false);
    }
  };

  const handleAcceptInvitation = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/organizations/invitations/${token}`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to accept invitation");
      }

      // Redirect to organization page
      router.push(`/dashboard/organizations/${data.organization_id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to accept invitation",
      );
      setIsSubmitting(false);
      setIsSigningUp(false);
    }
  };

  const handleAccept = async () => {
    // If not logged in, show signup form (handled in render)
    if (!userEmail) {
      return;
    }

    // Check if email matches
    if (invitation.email !== userEmail) {
      setError(
        `This invitation was sent to ${invitation.email}, but you are logged in as ${userEmail}. Please log out and sign in with the correct email address.`,
      );
      return;
    }

    await handleAcceptInvitation();
  };

  if (invitation.is_accepted) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">
          Invitation Already Accepted
        </h1>
        <p className="text-slate-600 mb-6">
          This invitation has already been accepted. You can access the
          organization from your dashboard.
        </p>
        <a
          href={`/dashboard/organizations/${invitation.organizations.id}`}
          className="inline-block px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Organization
        </a>
      </div>
    );
  }

  if (invitation.is_expired) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">
          Invitation Expired
        </h1>
        <p className="text-slate-600 mb-6">
          This invitation has expired. Please contact the organization owner to
          request a new invitation.
        </p>
        <a
          href="/dashboard"
          className="inline-block px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  const formatRole = (role: string) => {
    return role
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">
        Organization Invitation
      </h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4 mb-6">
        <div>
          <p className="text-sm text-slate-500 mb-1">
            You've been invited to join
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {invitation.organizations.name}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-500 mb-1">Role</p>
          <p className="text-slate-900">{formatRole(invitation.role)}</p>
        </div>

        <div>
          <p className="text-sm text-slate-500 mb-1">Email</p>
          <p className="text-slate-900">{invitation.email}</p>
        </div>
      </div>

      {!userEmail ? (
        <div className="mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-blue-900 text-sm mb-2">
              Create an account to accept this invitation. Your email address
              has been pre-filled.
            </p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="John Doe"
                required
              />
            </div>

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
                value={invitation.email}
                disabled
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={isSigningUp}
              className="w-full px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSigningUp
                ? "Creating Account..."
                : "Create Account & Accept Invitation"}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm text-slate-600 text-center">
              Already have an account?{" "}
              <Link
                href={`/dashboard/login?next=/dashboard/invitations/${token}`}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      ) : invitation.email !== userEmail ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-amber-900 text-sm mb-3">
            This invitation was sent to <strong>{invitation.email}</strong>, but
            you are logged in as <strong>{userEmail}</strong>.
          </p>
          <p className="text-amber-800 text-sm mb-3">
            Please log out and sign in with the correct email address to accept
            this invitation.
          </p>
          <Link
            href="/dashboard/login"
            className="inline-block px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      ) : null}

      <div className="flex items-center gap-4">
        <button
          onClick={handleAccept}
          disabled={
            isSubmitting || !userEmail || invitation.email !== userEmail
          }
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Accepting..." : "Accept Invitation"}
        </button>
        <Link
          href="/dashboard"
          className="px-6 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
