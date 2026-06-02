import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAssignedLines } from "@/lib/sales/assignments";

export const dynamic = "force-dynamic";

export default async function SalesIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard/login?next=/sales");

  const lines = await getAssignedLines(user.id);

  if (lines.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 max-w-md w-full p-8 text-center">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">
            No material lines assigned
          </h1>
          <p className="text-slate-600 mb-6">
            You don&apos;t have any material lines assigned to you yet. Ask your
            organization admin to add you to one or more lines.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  redirect(`/sales/${lines[0].id}`);
}
