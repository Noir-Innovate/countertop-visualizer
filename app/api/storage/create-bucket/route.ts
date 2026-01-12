import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey);

    // Check if bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      return NextResponse.json(
        { error: `Failed to list buckets: ${listError.message}` },
        { status: 500 }
      );
    }

    const bucketExists = buckets?.some((bucket) => bucket.name === "public-assets");

    if (bucketExists) {
      return NextResponse.json(
        { message: "Bucket 'public-assets' already exists", exists: true },
        { status: 200 }
      );
    }

    // Create the bucket using Storage Management API
    const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        name: "public-assets",
        public: true,
        file_size_limit: 26214400, // 25MB in bytes
        allowed_mime_types: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: `Failed to create bucket: ${errorData.message || response.statusText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(
      { message: "Bucket 'public-assets' created successfully", bucket: data },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

