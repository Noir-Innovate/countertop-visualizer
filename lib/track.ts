"use client";

import { trackToSupabase } from "./analytics";

export const trackEvent = (
  eventName: string,
  properties?: Record<string, unknown>,
) => {
  if (typeof window !== "undefined") {
    trackToSupabase(eventName, properties);
  }
};

export const trackABEvent = (
  variant: string,
  eventType: string,
  data?: Record<string, unknown>,
) => {
  trackEvent(`ab_test_${eventType}`, {
    variant,
    ...data,
  });
};
