"use client";

import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  defaults: "2025-11-30",
});

// Export posthog instance for feature flags and other direct access
export { posthog };

// Event tracking helpers
export const trackEvent = (
  eventName: string,
  properties?: Record<string, unknown>
) => {
  if (typeof window !== "undefined") {
    posthog.capture(eventName, properties);
  }
};

export const identifyUser = (
  userId: string,
  properties?: Record<string, unknown>
) => {
  if (typeof window !== "undefined") {
    posthog.identify(userId, properties);
  }
};

// AB Test specific events
export const trackABEvent = (
  variant: string,
  eventType: string,
  data?: Record<string, unknown>
) => {
  trackEvent(`ab_test_${eventType}`, {
    variant,
    ...data,
  });
};
