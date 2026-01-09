import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

// Lazy initialization of Supabase client
export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and Anon Key are required. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.')
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
  return supabaseInstance
}

// For backwards compatibility
export const supabase = typeof window !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY 
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null)
  : null

// Server-side client with service role for admin operations
export function createServerClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase URL and Service Role Key are required for server operations.')
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

// Types for our database tables
export interface UserSession {
  id: string
  phone: string
  verified: boolean
  created_at: string
}

export interface PhoneVerification {
  id: string
  phone: string
  code: string
  expires_at: string
  verified: boolean
  created_at: string
}

export interface Lead {
  id: string
  session_id: string | null
  name: string
  email: string
  address: string
  phone: string | null
  selected_slab_id: string | null
  selected_image_url: string | null
  ab_variant: string | null
  created_at: string
}
