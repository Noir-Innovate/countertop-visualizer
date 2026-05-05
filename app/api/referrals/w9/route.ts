import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storagePath } = (await req.json()) as { storagePath?: string };
  if (!storagePath || !storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const service = await createServiceClient();
  const now = new Date().toISOString();
  const { error } = await service.from("referrer_payout_profiles").upsert(
    {
      profile_id: user.id,
      w9_storage_path: storagePath,
      w9_collected_at: now,
      updated_at: now,
    },
    { onConflict: "profile_id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, w9CollectedAt: now });
}
