'use client'

import { posthog } from './posthog'

export type ABVariant = 'A' | 'B'

// Feature flag name in PostHog
const AB_TEST_FLAG = 'countertop-slab-access'

// Get the AB variant for the current user
export function getABVariant(): ABVariant {
  if (typeof window === 'undefined') {
    return 'A' // Default for SSR
  }

  // Check localStorage first for consistency
  const storedVariant = localStorage.getItem('ab_variant')
  if (storedVariant === 'A' || storedVariant === 'B') {
    return storedVariant
  }

  // Try to get from PostHog feature flag
  const flagValue = posthog.getFeatureFlag(AB_TEST_FLAG)
  
  let variant: ABVariant
  if (flagValue === 'full-access') {
    variant = 'B'
  } else if (flagValue === 'limited') {
    variant = 'A'
  } else {
    // Random assignment if PostHog isn't available
    variant = Math.random() < 0.5 ? 'A' : 'B'
  }

  // Store for consistency
  localStorage.setItem('ab_variant', variant)
  return variant
}

// Check if user should see limited slabs (Variant A behavior)
export function shouldShowLimitedSlabs(variant: ABVariant): boolean {
  return variant === 'A'
}

// Get the number of slabs to show initially
export function getInitialSlabCount(variant: ABVariant): number {
  return variant === 'A' ? 3 : Infinity
}

// Check if user has unlocked all slabs (via phone verification)
export function hasUnlockedSlabs(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('slabs_unlocked') === 'true'
}

// Unlock all slabs after phone verification
export function unlockSlabs(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('slabs_unlocked', 'true')
  }
}

// Get verified phone number
export function getVerifiedPhone(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('verified_phone')
}

// Store verified phone number
export function setVerifiedPhone(phone: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('verified_phone', phone)
  }
}


