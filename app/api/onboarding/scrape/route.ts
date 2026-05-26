import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { scrapeHomepage } from "@/lib/firecrawl";
import {
  classifyImagesAsMaterials,
  shortlistCandidateImages,
  type MaterialCandidate,
} from "@/lib/scrape-classify";

export const maxDuration = 300;

interface RequestBody {
  organizationId: string;
  websiteUrl: string;
}

export async function POST(req: NextRequest) {
  try {
    const { organizationId, websiteUrl } = (await req.json()) as RequestBody;
    if (!organizationId || !websiteUrl) {
      return NextResponse.json(
        { error: "organizationId and websiteUrl are required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "You do not have permission to start onboarding" },
        { status: 403 },
      );
    }

    const service = await createServiceClient();
    const { data: scrape, error: insertError } = await service
      .from("org_onboarding_scrapes")
      .insert({
        organization_id: organizationId,
        requested_by: user.id,
        source_url: websiteUrl,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !scrape) {
      console.error("Failed to insert scrape row", insertError);
      return NextResponse.json(
        { error: "Failed to create scrape job" },
        { status: 500 },
      );
    }

    // Kick off the scrape work in the background after the response is sent.
    after(runScrapeJob(scrape.id, websiteUrl));

    return NextResponse.json({ id: scrape.id });
  } catch (err) {
    console.error("Onboarding scrape error", err);
    return NextResponse.json(
      { error: "Failed to start scrape" },
      { status: 500 },
    );
  }
}

async function runScrapeJob(scrapeId: string, websiteUrl: string) {
  const service = await createServiceClient();

  const setProgress = async (
    stage: "scraping" | "extracting" | "classifying" | "finalizing",
    message: string,
    total?: number,
  ) => {
    await service
      .from("org_onboarding_scrapes")
      .update({
        status: "running",
        progress: total !== undefined ? { stage, message, total } : { stage, message },
      })
      .eq("id", scrapeId);
  };

  // Test-only short-circuit. Avoids hitting FireCrawl + Gemini during e2e
  // runs while still exercising the state machine (pending → running →
  // complete) so the UI's polling logic is properly tested.
  if (process.env.SCRAPE_MOCK_FIXTURES === "1") {
    await setProgress("scraping", "Scanning your website…");
    await new Promise((r) => setTimeout(r, 250));
    await service
      .from("org_onboarding_scrapes")
      .update({
        status: "complete",
        progress: null,
        result: {
          logoCandidates: [`${websiteUrl}/logo.png`],
          imageCandidates: [`${websiteUrl}/quartz.jpg`],
          colorCandidates: ["#2563eb"],
          primaryColor: "#2563eb",
          title: "Mock Stone Co",
          candidateMaterials: [
            {
              imageUrl: `${websiteUrl}/quartz.jpg`,
              category: "Countertops",
              materialName: "Mock Quartz",
              confidence: 0.99,
            },
          ],
        },
      })
      .eq("id", scrapeId);
    return;
  }

  await setProgress("scraping", "Scanning your website…");

  try {
    const homepage = await scrapeHomepage(websiteUrl);

    const shortlist = shortlistCandidateImages(homepage.imageCandidates);
    await setProgress(
      "extracting",
      `Found ${homepage.imageCandidates.length} images and ${homepage.logoCandidates.length} logo candidates.`,
    );

    let candidateMaterials: MaterialCandidate[] = [];
    if (shortlist.length > 0) {
      await setProgress(
        "classifying",
        `Identifying materials in ${shortlist.length} image${shortlist.length === 1 ? "" : "s"}…`,
        shortlist.length,
      );
      try {
        candidateMaterials = await classifyImagesAsMaterials(
          homepage.imageCandidates,
        );
      } catch (err) {
        console.warn("Material classification failed", err);
      }
    }

    await setProgress("finalizing", "Wrapping up…");

    await service
      .from("org_onboarding_scrapes")
      .update({
        status: "complete",
        progress: null,
        result: {
          logoCandidates: homepage.logoCandidates,
          imageCandidates: homepage.imageCandidates,
          colorCandidates: homepage.colorCandidates,
          primaryColor: homepage.primaryColor,
          title: homepage.title,
          candidateMaterials,
        },
      })
      .eq("id", scrapeId);
  } catch (err) {
    console.error("Scrape job failed", err);
    await service
      .from("org_onboarding_scrapes")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      })
      .eq("id", scrapeId);
  }
}
