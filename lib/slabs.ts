import { createClient } from '@supabase/supabase-js'

export interface Slab {
  id: string
  name: string
  imageUrl: string
  description: string
}

// Create a client for slab loading (works on both server and client)
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and Anon Key are required')
  }

  return createClient(supabaseUrl, supabaseAnonKey)
}

// Helper to generate slab ID from filename
function generateSlabId(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '') // Remove extension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, '') // Trim dashes
}

// Helper to generate slab name from filename
function generateSlabName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '') // Remove extension
    .replace(/[-_]/g, ' ') // Replace dashes/underscores with spaces
    .replace(/\b\w/g, c => c.toUpperCase()) // Capitalize words
}

// Fetch slabs dynamically from a material line's Supabase storage folder
export async function getSlabsForMaterialLine(supabaseFolder: string): Promise<Slab[]> {
  const supabase = getSupabaseClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  // List files from the material line's folder in public-assets bucket
  const { data: files, error } = await supabase.storage
    .from('public-assets')
    .list(supabaseFolder)

  if (error) {
    console.error('Error fetching slabs:', error)
    return []
  }

  // Filter for image files and map to Slab objects
  const slabs: Slab[] = (files || [])
    .filter(file => file.name.match(/\.(jpg|jpeg|png|webp|gif|tif|tiff)$/i))
    .map(file => ({
      id: generateSlabId(file.name),
      name: generateSlabName(file.name),
      imageUrl: `${supabaseUrl}/storage/v1/object/public/public-assets/${supabaseFolder}/${file.name}`,
      description: `${generateSlabName(file.name)} quartz countertop material`,
    }))

  return slabs
}

// Get featured slabs (first 3 slabs by default)
export function getFeaturedSlabs(slabs: Slab[], count: number = 3): string[] {
  return slabs.slice(0, count).map(s => s.id)
}

// Legacy function for backwards compatibility - uses default folder
export async function getDefaultSlabs(): Promise<Slab[]> {
  return getSlabsForMaterialLine('accent-countertops')
}

