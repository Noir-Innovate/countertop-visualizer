import { headers } from 'next/headers'
import { MaterialLineConfig, DEFAULT_MATERIAL_LINE_CONFIG } from './material-line'

// Get material line config from request headers (set by middleware)
export async function getMaterialLineFromHeaders(): Promise<MaterialLineConfig> {
  const headersList = await headers()
  
  const materialLineId = headersList.get('x-material-line-id')
  
  // If no material line ID in headers, return default config
  if (!materialLineId) {
    return DEFAULT_MATERIAL_LINE_CONFIG
  }

  return {
    id: materialLineId,
    organizationId: headersList.get('x-organization-id') || '',
    slug: headersList.get('x-material-line-slug') || '',
    name: decodeURIComponent(headersList.get('x-material-line-name') || ''),
    logoUrl: headersList.get('x-material-line-logo') || null,
    primaryColor: headersList.get('x-material-line-primary-color') || '#2563eb',
    accentColor: headersList.get('x-material-line-accent-color') || '#f59e0b',
    backgroundColor: headersList.get('x-material-line-background-color') || '#ffffff',
    supabaseFolder: headersList.get('x-material-line-folder') || 'default',
  }
}

// Generate CSS variables for material line theming
export function generateThemeStyles(materialLine: MaterialLineConfig): string {
  return `
    :root {
      --material-line-primary: ${materialLine.primaryColor};
      --material-line-accent: ${materialLine.accentColor};
      --material-line-background: ${materialLine.backgroundColor};
    }
  `
}
