import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "@/app/dashboard/profile/components/ProfileForm";

export default async function AccountProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const profileData = profile || {
    id: user.id,
    full_name: null,
    phone: null,
    avatar_url: null,
    email: user.email || null,
  };

  return (
    <ProfileForm
      initialProfile={profileData}
      initialEmail={profileData.email || user.email || ""}
    />
  );
}
