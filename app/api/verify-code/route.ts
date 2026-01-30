import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyCode } from "@/lib/twilio";

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json();

    if (!phone || !code) {
      return NextResponse.json(
        { error: "Phone and code are required" },
        { status: 400 },
      );
    }

    // Verify code using Twilio Verify
    const result = await verifyCode(phone, code);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Invalid verification code" },
        { status: 400 },
      );
    }

    // Code is verified, create or update user session in Supabase
    // Use service role client to bypass RLS
    const supabase = await createServiceClient();

    // Create or update user session
    const { data: existingSession } = await supabase
      .from("user_sessions")
      .select("id")
      .eq("phone", phone)
      .single();

    if (existingSession) {
      await supabase
        .from("user_sessions")
        .update({ verified: true })
        .eq("id", existingSession.id);
    } else {
      await supabase.from("user_sessions").insert({
        phone,
        verified: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Phone verified successfully",
      status: result.status,
    });
  } catch (error) {
    console.error("Verify code error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
