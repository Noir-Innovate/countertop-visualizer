'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect, ReactNode } from 'react'
import { MaterialLineProvider, MaterialLineConfig } from '@/lib/material-line'

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
        capture_pageview: false, // We'll manually track pageviews
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') posthog.debug()
        }
      })
    }
  }, [])

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>
  }

  return <PHProvider client={posthog}>{children}</PHProvider>
}

interface MaterialLineProviderWrapperProps {
  materialLine: MaterialLineConfig
  children: ReactNode
}

export function MaterialLineProviderWrapper({ materialLine, children }: MaterialLineProviderWrapperProps) {
  return (
    <MaterialLineProvider materialLine={materialLine}>
      {children}
    </MaterialLineProvider>
  )
}
