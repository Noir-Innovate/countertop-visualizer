import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardNav from './components/DashboardNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Public routes that don't require auth
  // The middleware handles this, but we double-check here
  const isAuthPage = typeof window !== 'undefined' && 
    (window.location.pathname === '/dashboard/login' || 
     window.location.pathname === '/dashboard/signup')

  if (!user && !isAuthPage) {
    // Let the page render - middleware will handle redirect if needed
    // This layout is also used for login/signup pages
  }

  // If user is logged in, show dashboard layout
  if (user) {
    // Fetch user's profile and organizations
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    const { data: memberships } = await supabase
      .from('organization_members')
      .select(`
        role,
        organizations(id, name)
      `)
      .eq('profile_id', user.id)

    const organizations = memberships?.map(m => {
      const org = m.organizations as unknown as { id: string; name: string } | null
      return {
        id: org?.id || '',
        name: org?.name || '',
        role: m.role,
      }
    }).filter(org => org.id) || []

    return (
      <div className="min-h-screen bg-slate-50">
        <DashboardNav 
          user={user} 
          profile={profile} 
          organizations={organizations} 
        />
        <main className="pt-16">
          {children}
        </main>
      </div>
    )
  }

  // For auth pages (login/signup), render without nav
  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  )
}

