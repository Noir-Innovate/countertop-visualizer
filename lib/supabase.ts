// Types for our database tables
// This file is kept for type definitions only
// Use @/lib/supabase/client for client-side singleton client
// Use @/lib/supabase/server for server-side clients

export interface UserSession {
  id: string;
  phone: string | null;
  verified: boolean;
  client_session_id: string | null;
  kitchen_image_url: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PhoneVerification {
  id: string;
  phone: string;
  code: string;
  expires_at: string;
  verified: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  session_id: string | null;
  name: string;
  email: string;
  address: string;
  phone: string | null;
  selected_slab_id: string | null;
  selected_image_url: string | null;
  ab_variant: string | null;
  material_line_id: string | null;
  organization_id: string | null;
  created_at: string;
  // Attribution
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  tags: Record<string, string> | null;
}
