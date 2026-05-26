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

  if (lines.length === 1) {
    redirect(`/sales/${lines[0].id}`);
  }

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

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          Pick a material line
        </h1>
        <p className="text-slate-600 mb-6">
          You&apos;re assigned to multiple lines. Choose which one to work in.
        </p>
        <div className="grid gap-3">
          {lines.map((line) => (
            <Link
              key={line.id}
              href={`/sales/${line.id}`}
              className="block bg-white rounded-lg border border-slate-200 p-4 hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{line.name}</p>
                  <p className="text-sm text-slate-500">
                    {line.organization_name}
                  </p>
                </div>
                {line.line_kind === "internal" && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    internal
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
