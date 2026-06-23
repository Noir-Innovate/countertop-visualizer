import { trackEvent } from "./track";

// All onboarding-funnel event names live here so casing/naming stays
// consistent. The admin funnel page filters on these prefixes — adding a
// new step means adding the constant here and instrumenting the page.

export const ONBOARDING_EVENTS = {
  rootViewed: "landing_root_viewed",
  rootCtaClicked: "landing_root_cta_clicked",
  demoViewed: "landing_demo_viewed",
  demoCtaClicked: "landing_demo_cta_clicked",
  signupViewed: "onboarding_signup_viewed",
  signupSubmitted: "onboarding_signup_submitted",
  emailConfirmed: "onboarding_email_confirmed",
  orgCreateViewed: "onboarding_org_create_viewed",
  orgCreated: "onboarding_org_created",
  trialViewed: "onboarding_trial_viewed",
  promoApplied: "onboarding_promo_applied",
  trialConfirmed: "onboarding_trial_confirmed",
  websiteViewed: "onboarding_website_viewed",
  websiteSubmitted: "onboarding_website_submitted",
  scrapeCompleted: "onboarding_scrape_completed",
  scrapeFailed: "onboarding_scrape_failed",
  wizardViewed: "onboarding_wizard_viewed",
  wizardFinalized: "onboarding_wizard_finalized",
  teamViewed: "onboarding_team_viewed",
  teamInvited: "onboarding_team_invited",
  teamSkipped: "onboarding_team_skipped",
  doneViewed: "onboarding_done_viewed",
} as const;

export type OnboardingEvent =
  (typeof ONBOARDING_EVENTS)[keyof typeof ONBOARDING_EVENTS];

export interface OnboardingTrackProps {
  profileId?: string;
  organizationId?: string;
  [key: string]: unknown;
}

export function trackOnboarding(
  event: OnboardingEvent,
  props?: OnboardingTrackProps,
) {
  if (!props) {
    trackEvent(event);
    return;
  }
  // Normalize the well-known camelCase keys to snake_case so the funnel SQL
  // (`metadata->>'profile_id'`) and per-event dashboards can rely on a
  // single shape. Unknown keys pass through unchanged.
  const { profileId, organizationId, materialLineId, ...rest } = props;
  const normalized: Record<string, unknown> = { ...rest };
  if (profileId !== undefined) normalized.profile_id = profileId;
  if (organizationId !== undefined) {
    normalized.organization_id = organizationId;
    // trackToSupabase reads organizationId off the top level to populate the
    // dedicated column — keep it there too so we don't lose that path.
    normalized.organizationId = organizationId;
  }
  if (materialLineId !== undefined) {
    normalized.material_line_id = materialLineId;
    normalized.materialLineId = materialLineId;
  }
  trackEvent(event, normalized);
}
