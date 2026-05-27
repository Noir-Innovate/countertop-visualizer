import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { ONBOARDING_EVENTS } from "@/lib/onboarding-track";

// View-event ordering = funnel stage ordering. Each entry is one bar on the
// chart; conversion is measured between consecutive entries.
const STAGES: Array<{ key: string; event: string; label: string }> = [
  {
    key: "root_viewed",
    event: ONBOARDING_EVENTS.rootViewed,
    label: "Visited landing page",
  },
  {
    key: "demo_viewed",
    event: ONBOARDING_EVENTS.demoViewed,
    label: "Viewed demo",
  },
  {
    key: "signup_submitted",
    event: ONBOARDING_EVENTS.signupSubmitted,
    label: "Signed up",
  },
  {
    key: "email_confirmed",
    event: ONBOARDING_EVENTS.emailConfirmed,
    label: "Confirmed email",
  },
  {
    key: "org_create_viewed",
    event: ONBOARDING_EVENTS.orgCreateViewed,
    label: "Opened create-org",
  },
  {
    key: "trial_viewed",
    event: ONBOARDING_EVENTS.trialViewed,
    label: "Reached trial",
  },
  {
    key: "website_viewed",
    event: ONBOARDING_EVENTS.websiteViewed,
    label: "Reached website",
  },
  {
    key: "wizard_viewed",
    event: ONBOARDING_EVENTS.wizardViewed,
    label: "Reached wizard",
  },
  {
    key: "done_viewed",
    event: ONBOARDING_EVENTS.doneViewed,
    label: "Finished onboarding",
  },
];

const ACTION_EVENTS: Array<{ key: string; event: string; label: string }> = [
  {
    key: "root_cta_clicked",
    event: ONBOARDING_EVENTS.rootCtaClicked,
    label: "Landing-page CTA clicks",
  },
  {
    key: "demo_cta_clicked",
    event: ONBOARDING_EVENTS.demoCtaClicked,
    label: "Demo CTA clicks",
  },
  {
    key: "signup_viewed",
    event: ONBOARDING_EVENTS.signupViewed,
    label: "Signup page views",
  },
  {
    key: "org_created",
    event: ONBOARDING_EVENTS.orgCreated,
    label: "Org created",
  },
  {
    key: "promo_applied",
    event: ONBOARDING_EVENTS.promoApplied,
    label: "Promo applied",
  },
  {
    key: "trial_confirmed",
    event: ONBOARDING_EVENTS.trialConfirmed,
    label: "Trial confirmed",
  },
  {
    key: "website_submitted",
    event: ONBOARDING_EVENTS.websiteSubmitted,
    label: "Website submitted",
  },
  {
    key: "scrape_completed",
    event: ONBOARDING_EVENTS.scrapeCompleted,
    label: "Scrape completed",
  },
  {
    key: "scrape_failed",
    event: ONBOARDING_EVENTS.scrapeFailed,
    label: "Scrape failed",
  },
  {
    key: "wizard_finalized",
    event: ONBOARDING_EVENTS.wizardFinalized,
    label: "Wizard finalized",
  },
];

interface EventRow {
  event_type: string;
  created_at: string;
  metadata: { profile_id?: string } | null;
  session_id: string | null;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export async function GET(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const utmSource = req.nextUrl.searchParams.get("utm_source") ?? null;
  const utmMedium = req.nextUrl.searchParams.get("utm_medium") ?? null;
  const utmCampaign = req.nextUrl.searchParams.get("utm_campaign") ?? null;

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const service = await createServiceClient();

  const allEvents = [
    ...STAGES.map((s) => s.event),
    ...ACTION_EVENTS.map((a) => a.event),
  ];

  let query = service
    .from("analytics_events")
    .select("event_type, created_at, metadata, session_id")
    .in("event_type", allEvents)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());
  if (utmSource) query = query.eq("utm_source", utmSource);
  if (utmMedium) query = query.eq("utm_medium", utmMedium);
  if (utmCampaign) query = query.eq("utm_campaign", utmCampaign);

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Per (event_type, identity) → earliest created_at. Identity is the
  // profile_id (post-signup) when known, otherwise the visitor's session_id
  // (anonymous). That lets the funnel stitch landing-page views to the
  // signup events that follow them: the visitor browses anonymously with a
  // session_id, then once they sign up the post-signup events still carry
  // the same session_id, so they line up as a single identity.
  const firstByStageByUser: Record<string, Map<string, number>> = {};
  for (const stage of STAGES) firstByStageByUser[stage.event] = new Map();

  const actionCounts: Record<string, Set<string>> = {};
  for (const action of ACTION_EVENTS) actionCounts[action.event] = new Set();

  for (const row of (rows ?? []) as EventRow[]) {
    const identity = row.metadata?.profile_id ?? row.session_id;
    if (!identity) continue;
    const ts = new Date(row.created_at).getTime();
    if (row.event_type in firstByStageByUser) {
      const map = firstByStageByUser[row.event_type];
      const existing = map.get(identity);
      if (existing == null || ts < existing) map.set(identity, ts);
    }
    if (row.event_type in actionCounts) {
      actionCounts[row.event_type].add(identity);
    }
  }

  const firstStageCount = firstByStageByUser[STAGES[0].event].size;

  const stages = STAGES.map((stage, idx) => {
    const users = firstByStageByUser[stage.event].size;
    const prevUsers =
      idx === 0 ? users : firstByStageByUser[STAGES[idx - 1].event].size;
    const convFromPrev = prevUsers > 0 ? (users / prevUsers) * 100 : 0;
    const convFromFirst = firstStageCount > 0
      ? (users / firstStageCount) * 100
      : 0;

    // Median seconds from this stage to the next stage, per user who hit both.
    let medianSecondsToNext: number | null = null;
    if (idx < STAGES.length - 1) {
      const nextMap = firstByStageByUser[STAGES[idx + 1].event];
      const currMap = firstByStageByUser[stage.event];
      const deltas: number[] = [];
      for (const [user, currTs] of currMap.entries()) {
        const nextTs = nextMap.get(user);
        if (nextTs != null && nextTs >= currTs) {
          deltas.push(Math.round((nextTs - currTs) / 1000));
        }
      }
      medianSecondsToNext = median(deltas);
    }

    return {
      key: stage.key,
      label: stage.label,
      users,
      convFromPrev: Math.round(convFromPrev * 10) / 10,
      convFromFirst: Math.round(convFromFirst * 10) / 10,
      medianSecondsToNext,
    };
  });

  const actions = ACTION_EVENTS.map((a) => ({
    key: a.key,
    label: a.label,
    users: actionCounts[a.event].size,
  }));

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    stages,
    actions,
  });
}
