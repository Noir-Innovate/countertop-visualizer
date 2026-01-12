import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VERCEL_API_BASE = 'https://api.vercel.com'

interface RemoveDomainRequest {
  materialLineId: string
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: RemoveDomainRequest = await request.json()
    const { materialLineId } = body

    if (!materialLineId) {
      return NextResponse.json(
        { error: 'Material line ID is required' },
        { status: 400 }
      )
    }

    // Get material line and verify user has access
    const { data: materialLine, error: materialLineError } = await supabase
      .from('material_lines')
      .select('id, organization_id, custom_domain')
      .eq('id', materialLineId)
      .single()

    if (materialLineError || !materialLine) {
      return NextResponse.json(
        { error: 'Material line not found' },
        { status: 404 }
      )
    }

    // Check if user is owner or admin of the organization
    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('profile_id', user.id)
      .eq('organization_id', materialLine.organization_id)
      .in('role', ['owner', 'admin'])
      .single()

    if (memberError || !membership) {
      return NextResponse.json(
        { error: 'You do not have permission to manage this material line' },
        { status: 403 }
      )
    }

    if (!materialLine.custom_domain) {
      return NextResponse.json(
        { error: 'No custom domain configured' },
        { status: 400 }
      )
    }

    // Remove domain from Vercel
    const vercelToken = process.env.VERCEL_API_TOKEN
    const vercelProjectId = process.env.VERCEL_PROJECT_ID
    const vercelTeamId = process.env.VERCEL_TEAM_ID

    if (!vercelToken || !vercelProjectId) {
      return NextResponse.json(
        { error: 'Vercel configuration missing' },
        { status: 500 }
      )
    }

    const vercelUrl = vercelTeamId
      ? `${VERCEL_API_BASE}/v9/projects/${vercelProjectId}/domains/${materialLine.custom_domain}?teamId=${vercelTeamId}`
      : `${VERCEL_API_BASE}/v9/projects/${vercelProjectId}/domains/${materialLine.custom_domain}`

    const vercelResponse = await fetch(vercelUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
      },
    })

    // Even if Vercel deletion fails, we should clear the domain from our DB
    if (!vercelResponse.ok) {
      console.warn('Failed to remove domain from Vercel:', await vercelResponse.text())
    }

    // Clear custom domain from material line
    const { error: updateError } = await supabase
      .from('material_lines')
      .update({
        custom_domain: null,
        custom_domain_verified: false,
      })
      .eq('id', materialLineId)

    if (updateError) {
      console.error('Failed to update material line:', updateError)
      return NextResponse.json(
        { error: 'Failed to remove domain configuration' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Domain removed successfully',
    })

  } catch (error) {
    console.error('Error removing domain:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
