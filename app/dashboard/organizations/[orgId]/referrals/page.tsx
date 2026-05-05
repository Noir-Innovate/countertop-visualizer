import { redirect } from "next/navigation";

// Referrals moved from org-scoped to account-scoped — see migration 060.
// Anyone with an account can refer, regardless of org ownership.
export default async function ReferralsRedirect() {
  redirect("/dashboard/referrals");
}
