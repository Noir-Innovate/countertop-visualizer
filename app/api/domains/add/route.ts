import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VERCEL_API_BASE = "https://api.vercel.com";

interface AddDomainRequest {
  materialLineId: string;
  domain: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: AddDomainRequest = await request.json();
    const { materialLineId, domain } = body;

    if (!materialLineId || !domain) {
      return NextResponse.json(
        { error: "Material line ID and domain are required" },
        { status: 400 },
      );
    }

    // Validate domain format
    const domainRegex =
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        { error: "Invalid domain format" },
        { status: 400 },
      );
    }

    // Verify user has access to this material line (is owner or admin of the org)
    const { data: materialLine, error: materialLineError } = await supabase
      .from("material_lines")
      .select("id, organization_id, custom_domain")
      .eq("id", materialLineId)
      .single();

    if (materialLineError || !materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 },
      );
    }

    // Check if user is owner or admin of the organization
    const { data: membership, error: memberError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", materialLine.organization_id)
      .in("role", ["owner", "admin"])
      .single();

    if (memberError || !membership) {
      return NextResponse.json(
        { error: "You do not have permission to manage this material line" },
        { status: 403 },
      );
    }

    // Check if domain is already in use
    const { data: existingMaterialLine } = await supabase
      .from("material_lines")
      .select("id")
      .eq("custom_domain", domain)
      .neq("id", materialLineId)
      .single();

    if (existingMaterialLine) {
      return NextResponse.json(
        { error: "This domain is already in use by another material line" },
        { status: 409 },
      );
    }

    // Register domain with Vercel
    const vercelToken = process.env.VERCEL_API_TOKEN;
    const vercelProjectId = process.env.VERCEL_PROJECT_ID;
    const vercelTeamId = process.env.VERCEL_TEAM_ID;

    if (!vercelToken || !vercelProjectId) {
      return NextResponse.json(
        { error: "Vercel configuration missing" },
        { status: 500 },
      );
    }

    const vercelUrl = vercelTeamId
      ? `${VERCEL_API_BASE}/v10/projects/${vercelProjectId}/domains?teamId=${vercelTeamId}`
      : `${VERCEL_API_BASE}/v10/projects/${vercelProjectId}/domains`;

    const vercelResponse = await fetch(vercelUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    });

    if (!vercelResponse.ok) {
      const vercelError = await vercelResponse.json();
      console.error("Vercel API error:", vercelError);

      // Handle specific Vercel errors
      if (vercelError.error?.code === "domain_already_in_use") {
        return NextResponse.json(
          { error: "This domain is already registered with Vercel" },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: "Failed to register domain with Vercel" },
        { status: 500 },
      );
    }

    const vercelData = await vercelResponse.json();

    // Log the Vercel response for debugging
    console.log(
      "Vercel domain creation response:",
      JSON.stringify(vercelData, null, 2),
    );

    // Update material line with custom domain (not verified yet)
    const { error: updateError } = await supabase
      .from("material_lines")
      .update({
        custom_domain: domain,
        custom_domain_verified: false,
      })
      .eq("id", materialLineId);

    if (updateError) {
      console.error("Failed to update material line:", updateError);
      return NextResponse.json(
        { error: "Failed to save domain configuration" },
        { status: 500 },
      );
    }

    // Extract DNS records from Vercel response
    // Vercel API v10 returns domain with verification array
    // Verification format: { type: "CNAME", domain: "visualizer.example.com", value: "8cf3d35e285abb03.vercel-dns-016.com.", reason: "..." }
    const dnsRecords: { type: string; name: string; value: string }[] = [];

    console.log(
      "Extracting DNS records from verification array:",
      vercelData.verification,
    );

    // Check if verification records are in the initial response
    if (vercelData.verification && Array.isArray(vercelData.verification)) {
      vercelData.verification.forEach((record: any) => {
        console.log(
          "Processing verification record:",
          JSON.stringify(record, null, 2),
        );

        if (record.type && record.value && record.domain) {
          // Extract subdomain from record.domain
          // record.domain is the full domain from Vercel (e.g., "visualizer.example.com")
          // We need to extract just the subdomain part (e.g., "visualizer")

          // Get root domain from our domain (e.g., "example.com")
          const rootDomainParts = domain.split(".");
          const rootDomain = rootDomainParts.slice(-2).join(".");

          // Extract subdomain from record.domain
          let subdomain = "@";
          if (record.domain === domain) {
            // If record.domain matches our full domain exactly
            const domainParts = domain.split(".");
            if (domainParts.length > 2) {
              subdomain = domainParts[0]; // e.g., "visualizer" from "visualizer.example.com"
            } else {
              subdomain = "@"; // Root domain
            }
          } else if (record.domain.endsWith(`.${rootDomain}`)) {
            // If record.domain ends with root domain, extract subdomain
            subdomain = record.domain.replace(`.${rootDomain}`, "") || "@";
          } else {
            // Fallback: extract from record.domain directly
            const recordDomainParts = record.domain.split(".");
            if (recordDomainParts.length > 2) {
              subdomain = recordDomainParts[0];
            } else {
              subdomain = "@";
            }
          }

          console.log(
            `Extracted DNS record: type=${record.type}, name=${subdomain}, value=${record.value}`,
          );
          dnsRecords.push({
            type: record.type,
            name: subdomain,
            value: record.value,
          });
        } else {
          console.warn("Skipping invalid verification record:", record);
        }
      });
    } else {
      console.log("No verification array found in initial response");
    }

    // If no verification records in initial response, fetch domain details
    if (dnsRecords.length === 0) {
      const domainDetailsUrl = vercelTeamId
        ? `${VERCEL_API_BASE}/v10/projects/${vercelProjectId}/domains/${domain}?teamId=${vercelTeamId}`
        : `${VERCEL_API_BASE}/v10/projects/${vercelProjectId}/domains/${domain}`;

      try {
        const domainDetailsResponse = await fetch(domainDetailsUrl, {
          headers: {
            Authorization: `Bearer ${vercelToken}`,
          },
        });

        if (domainDetailsResponse.ok) {
          const domainDetails = await domainDetailsResponse.json();

          // Vercel returns verification records in the domain object
          if (
            domainDetails.verification &&
            Array.isArray(domainDetails.verification)
          ) {
            domainDetails.verification.forEach((record: any) => {
              console.log(
                "Processing domain details verification record:",
                JSON.stringify(record, null, 2),
              );

              if (record.type && record.value && record.domain) {
                const rootDomainParts = domain.split(".");
                const rootDomain = rootDomainParts.slice(-2).join(".");

                // Extract subdomain from record.domain
                let subdomain = "@";
                if (record.domain === domain) {
                  if (rootDomainParts.length > 2) {
                    subdomain = rootDomainParts[0];
                  } else {
                    subdomain = "@";
                  }
                } else if (record.domain.endsWith(`.${rootDomain}`)) {
                  subdomain =
                    record.domain.replace(`.${rootDomain}`, "") || "@";
                } else {
                  const recordDomainParts = record.domain.split(".");
                  if (recordDomainParts.length > 2) {
                    subdomain = recordDomainParts[0];
                  } else {
                    subdomain = "@";
                  }
                }

                console.log(
                  `Extracted DNS record from details: type=${record.type}, name=${subdomain}, value=${record.value}`,
                );
                dnsRecords.push({
                  type: record.type,
                  name: subdomain,
                  value: record.value,
                });
              }
            });
          }
        }
      } catch (detailsError) {
        console.error("Failed to fetch domain details:", detailsError);
      }
    }

    // Final fallback to default CNAME if no records found
    if (dnsRecords.length === 0) {
      const subdomain =
        domain.split(".").length === 2 ? "@" : domain.split(".")[0];
      dnsRecords.push({
        type: "CNAME",
        name: subdomain,
        value: "cname.vercel-dns.com",
      });
    }

    console.log(
      "Final DNS records to return:",
      JSON.stringify(dnsRecords, null, 2),
    );

    // Return DNS configuration instructions
    return NextResponse.json({
      success: true,
      domain,
      verification: vercelData.verification || [],
      dnsRecords,
    });
  } catch (error) {
    console.error("Error adding domain:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
