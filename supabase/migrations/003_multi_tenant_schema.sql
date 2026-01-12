-- Multi-Tenant Schema Migration
-- This migration adds support for organizations, material lines, and multi-tenant analytics

-- ============================================
-- PROFILES TABLE (linked to auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at DESC);

-- ============================================
-- ORGANIZATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON organizations(created_at DESC);

-- ============================================
-- ORGANIZATION MEMBERS TABLE (many-to-many junction)
-- ============================================
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_profile ON organization_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);

-- ============================================
-- MATERIAL LINES TABLE
-- Each material line represents a unique domain with its own branding and materials
-- ============================================
CREATE TABLE IF NOT EXISTS material_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  custom_domain TEXT UNIQUE,
  custom_domain_verified BOOLEAN DEFAULT FALSE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2563eb',
  accent_color TEXT DEFAULT '#f59e0b',
  background_color TEXT DEFAULT '#ffffff',
  supabase_folder TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_lines_slug ON material_lines(slug);
CREATE INDEX IF NOT EXISTS idx_material_lines_custom_domain ON material_lines(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_lines_organization ON material_lines(organization_id);
CREATE INDEX IF NOT EXISTS idx_material_lines_created_at ON material_lines(created_at DESC);

-- ============================================
-- ANALYTICS EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_line_id UUID NOT NULL REFERENCES material_lines(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'slab_selected', 'generation_started', 'quote_submitted')),
  metadata JSONB DEFAULT '{}',
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_material_line ON analytics_events(material_line_id);
CREATE INDEX IF NOT EXISTS idx_analytics_org ON analytics_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id) WHERE session_id IS NOT NULL;

-- ============================================
-- UPDATE LEADS TABLE
-- ============================================
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS material_line_id UUID REFERENCES material_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_material_line ON leads(material_line_id) WHERE material_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_organization ON leads(organization_id) WHERE organization_id IS NOT NULL;

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES FOR PROFILES
-- ============================================
-- Service role can do everything
CREATE POLICY "Service role full access on profiles" 
  ON profiles 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Users can view their own profile
CREATE POLICY "Users can view own profile" 
  ON profiles 
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" 
  ON profiles 
  FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- RLS POLICIES FOR ORGANIZATION MEMBERS
-- ============================================
-- Service role can do everything
CREATE POLICY "Service role full access on organization_members" 
  ON organization_members 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Users can view their own memberships
CREATE POLICY "Users can view own memberships" 
  ON organization_members 
  FOR SELECT 
  TO authenticated 
  USING (profile_id = auth.uid());

-- Org owners/admins can manage members
CREATE POLICY "Org admins can insert members" 
  ON organization_members 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
    OR NOT EXISTS (
      SELECT 1 FROM organization_members WHERE organization_id = organization_members.organization_id
    )
  );

CREATE POLICY "Org admins can delete members" 
  ON organization_members 
  FOR DELETE 
  TO authenticated 
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- RLS POLICIES FOR ORGANIZATIONS
-- ============================================
-- Service role can do everything
CREATE POLICY "Service role full access on organizations" 
  ON organizations 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Members can view their orgs
CREATE POLICY "Members can view their orgs" 
  ON organizations 
  FOR SELECT 
  TO authenticated 
  USING (
    id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid()
    )
  );

-- Anyone authenticated can create an org
CREATE POLICY "Authenticated users can create orgs" 
  ON organizations 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- Org owners can update their orgs
CREATE POLICY "Org owners can update orgs" 
  ON organizations 
  FOR UPDATE 
  TO authenticated 
  USING (
    id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role = 'owner'
    )
  );

-- ============================================
-- RLS POLICIES FOR MATERIAL LINES
-- ============================================
-- Service role can do everything
CREATE POLICY "Service role full access on material_lines" 
  ON material_lines 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Anyone can view material lines (for public visualizer access)
CREATE POLICY "Anyone can view material_lines" 
  ON material_lines 
  FOR SELECT 
  TO anon, authenticated 
  USING (true);

-- Org admins/owners can create material lines
CREATE POLICY "Org admins can create material_lines" 
  ON material_lines 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Org admins/owners can update material lines
CREATE POLICY "Org admins can update material_lines" 
  ON material_lines 
  FOR UPDATE 
  TO authenticated 
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Org owners can delete material lines
CREATE POLICY "Org owners can delete material_lines" 
  ON material_lines 
  FOR DELETE 
  TO authenticated 
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role = 'owner'
    )
  );

-- ============================================
-- RLS POLICIES FOR ANALYTICS EVENTS
-- ============================================
-- Service role can do everything
CREATE POLICY "Service role full access on analytics_events" 
  ON analytics_events 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Anyone can insert analytics events (for public tracking)
CREATE POLICY "Anyone can insert analytics" 
  ON analytics_events 
  FOR INSERT 
  TO anon, authenticated 
  WITH CHECK (true);

-- Org members can view their org's events
CREATE POLICY "Org members can view analytics" 
  ON analytics_events 
  FOR SELECT 
  TO authenticated 
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid()
    )
  );

-- ============================================
-- UPDATE LEADS RLS POLICIES
-- ============================================
-- Org members can view their org's leads
CREATE POLICY "Org members can view leads" 
  ON leads 
  FOR SELECT 
  TO authenticated 
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid()
    )
  );

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_material_lines_updated_at
  BEFORE UPDATE ON material_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

