'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { trackEvent } from '@/lib/posthog'

interface ComparisonImage {
  id: string
  name: string
  imageUrl: string
  isOriginal?: boolean
  isLoading?: boolean
}

interface ImageComparisonProps {
  images: ComparisonImage[]
  allResults?: Array<{
    slabId: string
    isLoading: boolean
    imageData: string | null
  }>
  leftIndex: number
  rightIndex: number
  onLeftIndexChange: (index: number) => void
  onRightIndexChange: (index: number) => void
  onImageClick: (imageUrl: string, alt: string, imageIndex: number) => void
  onGetQuote?: (imageId: string, imageName: string, imageUrl: string) => void
  onDownload?: (imageId: string, imageName: string, imageUrl: string) => void
}

export default function ImageComparison({
  images,
  allResults = [],
  leftIndex,
  rightIndex,
  onLeftIndexChange,
  onRightIndexChange,
  onImageClick,
  onGetQuote,
  onDownload,
}: ImageComparisonProps) {
  if (images.length < 2) return null

  const [sliderPosition, setSliderPosition] = useState(50) // Percentage from left (0-100)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const leftImage = images[leftIndex]
  const rightImage = images[rightIndex]
  const leftResult = allResults.find((r) => r.slabId === leftImage.id)
  const rightResult = allResults.find((r) => r.slabId === rightImage.id)
  const leftIsLoading = leftImage.isLoading || leftResult?.isLoading
  const rightIsLoading = rightImage.isLoading || rightResult?.isLoading

  const handleShare = useCallback(async (image: ComparisonImage) => {
    // Track share event
    trackEvent('countertop_shared', {
      slabId: image.id,
      slabName: image.name,
      isOriginal: image.isOriginal || false,
    })
    
    try {
      let file: File | null = null
      
      // Handle data URLs (base64) or regular URLs
      if (image.imageUrl.startsWith('data:')) {
        // Convert data URL to blob
        const response = await fetch(image.imageUrl)
        const blob = await response.blob()
        file = new File([blob], `${image.name.replace(/\s+/g, '-')}.png`, { type: 'image/png' })
      } else {
        // Regular URL - fetch and convert to blob
        try {
          const response = await fetch(image.imageUrl)
          const blob = await response.blob()
          file = new File([blob], `${image.name.replace(/\s+/g, '-')}.png`, { type: blob.type || 'image/png' })
        } catch (fetchError) {
          // If fetch fails, fall back to URL sharing
          console.warn('Could not fetch image for sharing:', fetchError)
        }
      }

      // Use Web Share API if available
      if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Check out this ${image.name} countertop`,
          text: `I found this beautiful ${image.name} countertop design!`,
          files: [file],
        })
      } else if (navigator.share) {
        // Fallback: share without file (some browsers don't support file sharing)
        await navigator.share({
          title: `Check out this ${image.name} countertop`,
          text: `I found this beautiful ${image.name} countertop design!`,
          url: image.imageUrl,
        })
      } else {
        // Fallback: copy image URL to clipboard
        await navigator.clipboard.writeText(image.imageUrl)
        alert('Image link copied to clipboard!')
      }
    } catch (error) {
      // User cancelled or error occurred
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error sharing:', error)
        // Fallback: copy URL to clipboard
        try {
          await navigator.clipboard.writeText(image.imageUrl)
          alert('Image link copied to clipboard!')
        } catch (clipboardError) {
          console.error('Error copying to clipboard:', clipboardError)
        }
      }
    }
  }, [])

  // Handle mouse/touch events for dragging
  const updateSliderPosition = (clientX: number) => {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPosition(percentage)
  }

  useEffect(() => {
    const handleMove = (clientX: number) => {
      if (!isDragging) return
      updateSliderPosition(clientX)
    }

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX)
      }
    }

    const handleEnd = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('mouseup', handleEnd)
      document.addEventListener('touchend', handleEnd)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('mouseup', handleEnd)
      document.removeEventListener('touchend', handleEnd)
    }
  }, [isDragging])

  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleSliderTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleContainerClick = (e: React.MouseEvent) => {
    if (!isDragging && containerRef.current) {
      updateSliderPosition(e.clientX)
    }
  }

  const handleContainerTouchStart = (e: React.TouchEvent) => {
    if (!isDragging && containerRef.current && e.touches.length > 0) {
      updateSliderPosition(e.touches[0].clientX)
    }
  }

  return (
    <div className="space-y-4">
      {/* Comparison Slider Container */}
      <div 
        ref={containerRef}
        className="relative aspect-video md:rounded-xl overflow-hidden bg-[var(--color-bg-secondary)] cursor-col-resize select-none"
        onClick={handleContainerClick}
        onTouchStart={handleContainerTouchStart}
      >
        {/* Right Image (Bottom Layer) */}
        <div className="absolute inset-0">
          {rightIsLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <svg
                  className="animate-spin h-12 w-12 text-[var(--color-accent)] mx-auto mb-4"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Generating...
                </p>
              </div>
            </div>
          ) : (
            <Image
              src={rightImage.imageUrl}
              alt={rightImage.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 100vw"
            />
          )}
          
          {/* Right Badge */}
          {!rightIsLoading && (
            <div className={`absolute top-3 right-3 px-3 py-1 text-white text-sm font-medium rounded-full z-10 ${
              rightImage.isOriginal ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-accent)]'
            }`}>
              {rightImage.isOriginal ? 'Original' : rightImage.name}
            </div>
          )}
        </div>

        {/* Left Image (Top Layer - Clipped) */}
        <div 
          className="absolute inset-0"
          style={{
            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
          }}
        >
          {leftIsLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <svg
                  className="animate-spin h-12 w-12 text-[var(--color-accent)] mx-auto mb-4"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Generating...
                </p>
              </div>
            </div>
          ) : (
            <Image
              src={leftImage.imageUrl}
              alt={leftImage.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 100vw"
            />
          )}
          
          {/* Left Badge */}
          {!leftIsLoading && (
            <div className={`absolute top-3 left-3 px-3 py-1 text-white text-sm font-medium rounded-full z-10 ${
              leftImage.isOriginal ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-accent)]'
            }`}>
              {leftImage.isOriginal ? 'Original' : leftImage.name}
            </div>
          )}
        </div>

        {/* Slider Line and Handle */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-20 cursor-col-resize"
          style={{ left: `${sliderPosition}%` }}
        >
          {/* Slider Handle */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center cursor-col-resize touch-none"
            onMouseDown={handleSliderMouseDown}
            onTouchStart={handleSliderTouchStart}
          >
            {/* Arrow Icon */}
            <svg
              className="w-6 h-6 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Controls Below */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-2 md:px-0">
        {/* Left Controls */}
        <div className="space-y-2">
          {/* Left Selector */}
          <select
            value={leftIndex}
            onChange={(e) => onLeftIndexChange(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            {images.map((img, idx) => (
              <option key={img.id} value={idx}>
                {img.isOriginal ? 'Original Kitchen' : img.name}
              </option>
            ))}
          </select>

          {/* Action Buttons - only for non-original, not loading */}
          {!leftImage.isOriginal && !leftIsLoading && (onGetQuote || onDownload) && (
            <div className="flex gap-2">
              {onDownload && (
                <button
                  onClick={() => onDownload(leftImage.id, leftImage.name, leftImage.imageUrl)}
                  className="flex-shrink-0 px-2 py-2 bg-white hover:bg-white/95 text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center border border-[var(--color-border)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="hidden md:inline ml-1">Download</span>
                </button>
              )}
              <button
                onClick={() => handleShare(leftImage)}
                className="flex-shrink-0 px-2 py-2 bg-white hover:bg-white/95 text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center border border-[var(--color-border)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="hidden md:inline ml-1">Share</span>
              </button>
              {onGetQuote && (
                <button
                  onClick={() => onGetQuote(leftImage.id, leftImage.name, leftImage.imageUrl)}
                  className="flex-1 px-3 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center gap-1.5"
                >
                  Get Quote
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Controls */}
        <div className="space-y-2">
          {/* Right Selector */}
          <select
            value={rightIndex}
            onChange={(e) => onRightIndexChange(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            {images.map((img, idx) => (
              <option key={img.id} value={idx}>
                {img.isOriginal ? 'Original Kitchen' : img.name}
              </option>
            ))}
          </select>

          {/* Action Buttons - only for non-original, not loading */}
          {!rightImage.isOriginal && !rightIsLoading && (onGetQuote || onDownload) && (
            <div className="flex gap-2">
              {onDownload && (
                <button
                  onClick={() => onDownload(rightImage.id, rightImage.name, rightImage.imageUrl)}
                  className="flex-shrink-0 px-2 py-2 bg-white hover:bg-white/95 text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center border border-[var(--color-border)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="hidden md:inline ml-1">Download</span>
                </button>
              )}
              <button
                onClick={() => handleShare(rightImage)}
                className="flex-shrink-0 px-2 py-2 bg-white hover:bg-white/95 text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center border border-[var(--color-border)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="hidden md:inline ml-1">Share</span>
              </button>
              {onGetQuote && (
                <button
                  onClick={() => onGetQuote(rightImage.id, rightImage.name, rightImage.imageUrl)}
                  className="flex-1 px-3 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center gap-1.5"
                >
                  Get Quote
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center text-sm text-[var(--color-text-secondary)] px-6 md:px-0">
        Drag the slider to compare images side by side
      </p>
    </div>
  )
}


