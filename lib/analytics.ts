import { createClient } from '@supabase/supabase-js'

export type EventType = 'page_view' | 'slab_selected' | 'generation_started' | 'quote_submitted'

interface TrackEventParams {
  materialLineId: string
  organizationId: string
  eventType: EventType
  metadata?: Record<string, unknown>
  sessionId?: string
}

// Create a client for analytics (works on both server and client)
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and Anon Key are required')
  }

  return createClient(supabaseUrl, supabaseAnonKey)
}

// Generate a session ID for anonymous visitor tracking
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return 'server-' + Math.random().toString(36).substring(2, 15)
  }

  const storageKey = 'countertop_session_id'
  let sessionId = sessionStorage.getItem(storageKey)
  
  if (!sessionId) {
    sessionId = 'session-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36)
    sessionStorage.setItem(storageKey, sessionId)
  }
  
  return sessionId
}

// Track an analytics event
export async function trackEvent({
  materialLineId,
  organizationId,
  eventType,
  metadata = {},
  sessionId,
}: TrackEventParams): Promise<{ success: boolean; error?: string }> {
  // Skip if no material line context (e.g., localhost development without material line)
  if (!materialLineId || materialLineId === 'default') {
    console.log('[Analytics] Skipped - no material line context:', eventType)
    return { success: true }
  }

  try {
    const supabase = getSupabaseClient()
    
    const { error } = await supabase
      .from('analytics_events')
      .insert({
        material_line_id: materialLineId,
        organization_id: organizationId,
        event_type: eventType,
        metadata,
        session_id: sessionId || getOrCreateSessionId(),
      })

    if (error) {
      console.error('[Analytics] Failed to track event:', error)
      return { success: false, error: error.message }
    }

    console.log('[Analytics] Event tracked:', eventType, metadata)
    return { success: true }
  } catch (error) {
    console.error('[Analytics] Error:', error)
    return { success: false, error: 'Failed to track event' }
  }
}

// Convenience functions for common events
export async function trackPageView(materialLineId: string, organizationId: string, metadata?: Record<string, unknown>) {
  return trackEvent({
    materialLineId,
    organizationId,
    eventType: 'page_view',
    metadata: {
      ...metadata,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      referrer: typeof window !== 'undefined' ? document.referrer : undefined,
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : undefined,
    },
  })
}

export async function trackSlabSelected(materialLineId: string, organizationId: string, slabId: string, slabName: string) {
  return trackEvent({
    materialLineId,
    organizationId,
    eventType: 'slab_selected',
    metadata: { slabId, slabName },
  })
}

export async function trackGenerationStarted(materialLineId: string, organizationId: string, slabCount: number, slabIds: string[]) {
  return trackEvent({
    materialLineId,
    organizationId,
    eventType: 'generation_started',
    metadata: { slabCount, slabIds },
  })
}

export async function trackQuoteSubmitted(
  materialLineId: string, 
  organizationId: string, 
  leadData: { name: string; email: string; selectedSlab?: string }
) {
  return trackEvent({
    materialLineId,
    organizationId,
    eventType: 'quote_submitted',
    metadata: leadData,
  })
}
