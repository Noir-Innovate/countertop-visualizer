'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>
}

interface MaterialLine {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  accent_color: string
  background_color: string
  supabase_folder: string
}

export default function MaterialLineSettingsPage({ params }: Props) {
  const { orgId, materialLineId } = use(params)
  const router = useRouter()
  const [materialLine, setMaterialLine] = useState<MaterialLine | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#2563eb')
  const [accentColor, setAccentColor] = useState('#f59e0b')
  const [backgroundColor, setBackgroundColor] = useState('#ffffff')

  useEffect(() => {
    const fetchMaterialLine = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('material_lines')
        .select('*')
        .eq('id', materialLineId)
        .single()

      if (data) {
        setMaterialLine(data)
        setName(data.name)
        setLogoUrl(data.logo_url || '')
        setPrimaryColor(data.primary_color)
        setAccentColor(data.accent_color)
        setBackgroundColor(data.background_color)
      }
      setLoading(false)
    }

    fetchMaterialLine()
  }, [materialLineId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSaving(true)

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('material_lines')
        .update({
          name,
          logo_url: logoUrl || null,
          primary_color: primaryColor,
          accent_color: accentColor,
          background_color: backgroundColor,
        })
        .eq('id', materialLineId)

      if (updateError) {
        setError(updateError.message)
        return
      }

      setSuccess(true)
      router.refresh()
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-200 rounded w-1/2 mb-8"></div>
          <div className="bg-white rounded-xl p-6 space-y-6">
            <div className="h-10 bg-slate-200 rounded"></div>
            <div className="h-10 bg-slate-200 rounded"></div>
            <div className="h-10 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!materialLine) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-slate-600">Material line not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/dashboard" className="hover:text-slate-700">Dashboard</Link>
          <span>/</span>
          <Link href={`/dashboard/organizations/${orgId}`} className="hover:text-slate-700">Organization</Link>
          <span>/</span>
          <Link href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}`} className="hover:text-slate-700">{materialLine.name}</Link>
          <span>/</span>
          <span>Settings</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Material Line Settings</h1>
        <p className="text-slate-600 mt-1">Customize your material line&apos;s branding and appearance</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm">Settings saved successfully!</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
              Material Line Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              required
            />
          </div>

          <div>
            <label htmlFor="logoUrl" className="block text-sm font-medium text-slate-700 mb-1">
              Logo URL
            </label>
            <input
              id="logoUrl"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="https://example.com/logo.png"
            />
            <p className="mt-1 text-sm text-slate-500">
              URL to your logo image. Recommended size: 200x80px
            </p>
            {logoUrl && (
              <div className="mt-3 p-4 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500 mb-2">Preview:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo preview" className="h-12 object-contain" />
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-medium text-slate-900 mb-4">Theme Colors</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="primaryColor" className="block text-sm font-medium text-slate-700 mb-1">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="primaryColor"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-12 rounded-lg border border-slate-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="accentColor" className="block text-sm font-medium text-slate-700 mb-1">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="accentColor"
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-12 h-12 rounded-lg border border-slate-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="backgroundColor" className="block text-sm font-medium text-slate-700 mb-1">
                  Background
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="backgroundColor"
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-12 h-12 rounded-lg border border-slate-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Color Preview */}
            <div className="mt-4 p-4 rounded-lg border border-slate-200" style={{ backgroundColor }}>
              <div className="flex items-center gap-4">
                <div className="px-4 py-2 rounded-lg text-white font-medium" style={{ backgroundColor: primaryColor }}>
                  Primary Button
                </div>
                <div className="px-4 py-2 rounded-lg text-white font-medium" style={{ backgroundColor: accentColor }}>
                  Accent Button
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
