import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ orgId: string; materialLineId: string }>;
}

export default async function InternalMaterialLineLayout({
  children,
  params,
}: LayoutProps) {
  const { orgId, materialLineId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .single();

  if (!membership) {
    redirect("/dashboard");
  }

  const { data: materialLine } = await supabase
    .from("material_lines")
    .select("id, line_kind")
    .eq("id", materialLineId)
    .eq("organization_id", orgId)
    .maybeSingle();

  // If this is no longer an internal line, fall back to default material-line route.
  if (!materialLine || materialLine.line_kind !== "internal") {
    redirect(
      `/dashboard/organizations/${orgId}/material-lines/${materialLineId}`,
    );
  }

  const { data: billingAccount } = await supabase
    .from("organization_billing_accounts")
    .select(
      "internal_plan_status, internal_plan_current_period_end, internal_plan_cancel_at_period_end",
    )
    .eq("organization_id", orgId)
    .maybeSingle();

  const hasActiveInternalPlan = ["active", "trialing", "past_due"].includes(
    billingAccount?.internal_plan_status || "",
  );

  if (hasActiveInternalPlan) {
    return <>{children}</>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Internal plan required
        </h1>
        <p className="text-slate-600 mt-2">
          This organization&apos;s internal-lines plan is not active. Update
          billing to restore access to internal material line screens.
        </p>
        {billingAccount?.internal_plan_cancel_at_period_end &&
          billingAccount?.internal_plan_current_period_end && (
            <p className="text-sm text-slate-500 mt-3">
              Plan ended or will end on{" "}
              {new Date(
                billingAccount.internal_plan_current_period_end,
              ).toLocaleDateString()}
              .
            </p>
          )}
        <div className="mt-6">
          <Link
            href={`/dashboard/organizations/${orgId}/billing`}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Update Billing
          </Link>
        </div>
      </div>
    </div>
  );
}
