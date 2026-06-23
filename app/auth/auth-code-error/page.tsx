import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            This link didn&apos;t work
          </h1>
          <p className="text-slate-600 mb-6">
            Your confirmation or sign-in link has expired or was already used.
            Links can only be opened once. Please sign in, or request a new
            confirmation email from the sign-up page.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/dashboard/login"
              className="inline-block py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all"
            >
              Go to Sign In
            </Link>
            <Link
              href="/dashboard/signup"
              className="inline-block py-3 px-6 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-all"
            >
              Back to Sign Up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
