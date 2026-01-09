'use client'

import Image from 'next/image'
import type { Slab } from '@/lib/types'
import { trackEvent } from '@/lib/posthog'

interface SlabSelectorProps {
  slabs: Slab[]
  selectedSlabs: Slab[]
  onSlabSelect: (slab: Slab) => void
  maxSelections?: number
  showUnlockPrompt?: boolean
  onUnlockClick?: () => void
  isLimited?: boolean
}

export default function SlabSelector({
  slabs,
  selectedSlabs,
  onSlabSelect,
  maxSelections = 3,
  showUnlockPrompt = false,
  onUnlockClick,
  isLimited = false,
}: SlabSelectorProps) {
  const isSelected = (slab: Slab) => selectedSlabs.some(s => s.id === slab.id)
  const isDisabled = (slab: Slab) => !isSelected(slab) && selectedSlabs.length >= maxSelections

  const handleSlabClick = (slab: Slab) => {
    trackEvent('slab_clicked', { slabId: slab.id, slabName: slab.name })
    onSlabSelect(slab)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {slabs.map((slab) => {
          const selected = isSelected(slab)
          const disabled = isDisabled(slab)
          
          return (
            <button
              key={slab.id}
              onClick={() => handleSlabClick(slab)}
              disabled={disabled}
              className={`
                group relative flex flex-col overflow-hidden rounded-xl border-2 
                transition-all duration-200 text-left
                ${selected
                  ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)] ring-offset-2'
                  : disabled
                    ? 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
                    : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50 hover:shadow-md'
                }
              `}
            >
              {/* Slab Image */}
              <div className="relative aspect-square overflow-hidden bg-[var(--color-bg-secondary)]">
                <Image
                  src={slab.imageUrl}
                  alt={slab.name}
                  fill
                  className="object-cover object-center transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              
              {/* Slab Info */}
              <div className="p-3 bg-white flex-shrink-0">
                <h3 className="font-semibold text-[var(--color-text)] text-sm">
                  {slab.name}
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 line-clamp-2">
                  {slab.description}
                </p>
              </div>

              {/* Selected Indicator */}
              {selected && (
                <div className="absolute top-2 right-2 bg-[var(--color-accent)] text-white rounded-full p-1.5 shadow-lg">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Unlock More Slabs Prompt */}
      {showUnlockPrompt && isLimited && (
        <div className="mt-6 p-4 bg-gradient-to-r from-[var(--color-accent)]/10 to-[var(--color-accent)]/5 rounded-xl border border-[var(--color-accent)]/20">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h4 className="font-semibold text-[var(--color-text)]">
                Want to see more options?
              </h4>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                Unlock all {24} countertop styles with a quick phone verification
              </p>
            </div>
            <button
              onClick={onUnlockClick}
              className="btn btn-accent flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Unlock All Slabs
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


