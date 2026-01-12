import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VERCEL_API_BASE = "https://api.vercel.com";

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const materialLineId = searchParams.get("materialLineId");

    if (!materialLineId) {
      return NextResponse.json(
        { error: "Material line ID is required" },
        { status: 400 }
      );
    }

    // Get material line and verify user has access
    const { data: materialLine, error: materialLineError } = await supabase
      .from("material_lines")
      .select("id, organization_id, custom_domain, custom_domain_verified")
      .eq("id", materialLineId)
      .single();

    if (materialLineError || !materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 }
      );
    }

    // Check if user is member of the organization
    const { data: membership, error: memberError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", materialLine.organization_id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json(
        { error: "You do not have permission to view this material line" },
        { status: 403 }
      );
    }

    if (!materialLine.custom_domain) {
      return NextResponse.json({
        configured: false,
        domain: null,
        verified: false,
      });
    }

    // Check domain status with Vercel
    const vercelToken = process.env.VERCEL_API_TOKEN;
    const vercelTeamId = process.env.VERCEL_TEAM_ID;

    if (!vercelToken) {
      return NextResponse.json(
        { error: "Vercel configuration missing" },
        { status: 500 }
      );
    }

    const vercelUrl = vercelTeamId
      ? `${VERCEL_API_BASE}/v6/domains/${materialLine.custom_domain}/config?teamId=${vercelTeamId}`
      : `${VERCEL_API_BASE}/v6/domains/${materialLine.custom_domain}/config`;

    const vercelResponse = await fetch(vercelUrl, {
      headers: {
        Authorization: `Bearer ${vercelToken}`,
      },
    });

    if (!vercelResponse.ok) {
      // Domain might not be configured yet - try to get DNS records from project domains endpoint
      const projectId = process.env.VERCEL_PROJECT_ID;
      const domainsUrl = vercelTeamId
        ? `${VERCEL_API_BASE}/v10/projects/${projectId}/domains?teamId=${vercelTeamId}`
        : `${VERCEL_API_BASE}/v10/projects/${projectId}/domains`;

      let dnsRecords: { type: string; name: string; value: string }[] = [];

      try {
        const domainsResponse = await fetch(domainsUrl, {
          headers: {
            Authorization: `Bearer ${vercelToken}`,
          },
        });

        if (domainsResponse.ok) {
          const domainsData = await domainsResponse.json();
          const domainInfo = domainsData.domains?.find(
            (d: any) => d.name === materialLine.custom_domain
          );

          if (
            domainInfo?.verification &&
            Array.isArray(domainInfo.verification)
          ) {
            domainInfo.verification.forEach((record: any) => {
              if (record.type && record.value && record.domain) {
                // Extract subdomain from record.domain
                const rootDomainParts = materialLine.custom_domain!.split(".");
                const rootDomain = rootDomainParts.slice(-2).join(".");

                if (
                  record.domain === materialLine.custom_domain ||
                  record.domain.endsWith(`.${rootDomain}`)
                ) {
                  const subdomain =
                    record.domain.replace(`.${rootDomain}`, "") || "@";
                  dnsRecords.push({
                    type: record.type,
                    name: subdomain === rootDomain ? "@" : subdomain,
                    value: record.value,
                  });
                } else {
                  const domainParts = record.domain.split(".");
                  const subdomain =
                    domainParts.length === 2 ? "@" : domainParts[0];
                  dnsRecords.push({
                    type: record.type,
                    name: subdomain,
                    value: record.value,
                  });
                }
              }
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch domain info:", err);
      }

      // Fallback to default if no records found
      if (dnsRecords.length === 0) {
        const subdomain = materialLine.custom_domain!.split(".")[0];
        dnsRecords.push({
          type: "CNAME",
          name: subdomain,
          value: "cname.vercel-dns.com",
        });
      }

      return NextResponse.json({
        configured: true,
        domain: materialLine.custom_domain,
        verified: false,
        status: "pending",
        dnsRecords,
      });
    }

    const vercelData = await vercelResponse.json();
    const isVerified = vercelData.misconfigured === false;

    // Extract DNS records from Vercel response
    // Vercel returns verification array with type, domain, value, reason
    const dnsRecords: { type: string; name: string; value: string }[] = [];
    const vercelProjectId = process.env.VERCEL_PROJECT_ID;

    // Try to get DNS records from project domains endpoint (more reliable)
    if (vercelProjectId) {
      const domainsUrl = vercelTeamId
        ? `${VERCEL_API_BASE}/v10/projects/${vercelProjectId}/domains?teamId=${vercelTeamId}`
        : `${VERCEL_API_BASE}/v10/projects/${vercelProjectId}/domains`;

      try {
        const domainsResponse = await fetch(domainsUrl, {
          headers: {
            Authorization: `Bearer ${vercelToken}`,
          },
        });

        if (domainsResponse.ok) {
          const domainsData = await domainsResponse.json();
          const domainInfo = domainsData.domains?.find(
            (d: any) => d.name === materialLine.custom_domain
          );

          if (
            domainInfo?.verification &&
            Array.isArray(domainInfo.verification)
          ) {
            domainInfo.verification.forEach((record: any) => {
              if (record.type && record.value && record.domain) {
                // Extract subdomain from record.domain
                const rootDomainParts = materialLine.custom_domain!.split(".");
                const rootDomain = rootDomainParts.slice(-2).join(".");

                // Extract subdomain from record.domain
                if (
                  record.domain === materialLine.custom_domain ||
                  record.domain.endsWith(`.${rootDomain}`)
                ) {
                  const subdomain =
                    record.domain.replace(`.${rootDomain}`, "") || "@";
                  dnsRecords.push({
                    type: record.type,
                    name: subdomain === rootDomain ? "@" : subdomain,
                    value: record.value,
                  });
                } else {
                  // Fallback: extract from record.domain
                  const domainParts = record.domain.split(".");
                  const subdomain =
                    domainParts.length === 2 ? "@" : domainParts[0];
                  dnsRecords.push({
                    type: record.type,
                    name: subdomain,
                    value: record.value,
                  });
                }
              }
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch domain info from projects:", err);
      }
    }

    // Fallback: try verification from config response
    if (
      dnsRecords.length === 0 &&
      vercelData.verification &&
      Array.isArray(vercelData.verification)
    ) {
      vercelData.verification.forEach((record: any) => {
        if (record.type && record.value && record.domain) {
          const rootDomainParts = materialLine.custom_domain!.split(".");
          const rootDomain = rootDomainParts.slice(-2).join(".");

          if (
            record.domain === materialLine.custom_domain ||
            record.domain.endsWith(`.${rootDomain}`)
          ) {
            const subdomain =
              record.domain.replace(`.${rootDomain}`, "") || "@";
            dnsRecords.push({
              type: record.type,
              name: subdomain === rootDomain ? "@" : subdomain,
              value: record.value,
            });
          } else {
            const domainParts = record.domain.split(".");
            const subdomain = domainParts.length === 2 ? "@" : domainParts[0];
            dnsRecords.push({
              type: record.type,
              name: subdomain,
              value: record.value,
            });
          }
        }
      });
    }

    // Final fallback to default CNAME if no records found
    if (dnsRecords.length === 0) {
      const domainParts = materialLine.custom_domain!.split(".");
      const isRootDomain = domainParts.length === 2;
      const subdomain = isRootDomain ? "@" : domainParts[0];
      dnsRecords.push({
        type: "CNAME",
        name: subdomain,
        value: "cname.vercel-dns.com",
      });
    }

    // Update material line verification status if changed
    if (isVerified && !materialLine.custom_domain_verified) {
      await supabase
        .from("material_lines")
        .update({ custom_domain_verified: true })
        .eq("id", materialLineId);
    }

    return NextResponse.json({
      configured: true,
      domain: materialLine.custom_domain,
      verified: isVerified,
      status: isVerified ? "active" : "pending",
      dnsRecords,
      vercelConfig: vercelData,
    });
  } catch (error) {
    console.error("Error checking domain status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
