"use client";

import { useEffect } from "react";
import {
  trackOnboarding,
  type OnboardingEvent,
  type OnboardingTrackProps,
} from "@/lib/onboarding-track";

interface Props {
  event: OnboardingEvent;
  profileId?: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}

// Drop-in client component for server-rendered pages. Fires the view event
// exactly once on mount. Renders nothing.
export function TrackView({ event, profileId, organizationId, metadata }: Props) {
  useEffect(() => {
    const props: OnboardingTrackProps = { ...(metadata ?? {}) };
    if (profileId) props.profileId = profileId;
    if (organizationId) props.organizationId = organizationId;
    trackOnboarding(event, props);
    // Intentionally no deps — fire-once on mount per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
