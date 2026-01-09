'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'

interface CarouselImage {
  id: string
  name: string
  imageUrl: string
  isOriginal?: boolean
}

interface ImageCarouselProps {
  images: CarouselImage[]
  currentIndex: number
  onIndexChange: (index: number) => void
  onImageClick: (imageUrl: string, alt: string) => void
  onRetry?: (imageId: string) => void
  onGetQuote?: (imageId: string, imageName: string, imageUrl: string) => void
  onDownload?: (imageId: string, imageName: string, imageUrl: string) => void
}

export default function ImageCarousel({
  images,
  currentIndex,
  onIndexChange,
  onImageClick,
  onRetry,
  onGetQuote,
  onDownload,
}: ImageCarouselProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null)

  const goToPrevious = useCallback(() => {
    onIndexChange(currentIndex === 0 ? images.length - 1 : currentIndex - 1)
  }, [currentIndex, images.length, onIndexChange])

  const goToNext = useCallback(() => {
    onIndexChange(currentIndex === images.length - 1 ? 0 : currentIndex + 1)
  }, [currentIndex, images.length, onIndexChange])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevious()
      if (e.key === 'ArrowRight') goToNext()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPrevious, goToNext])

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return
    
    const touchEnd = e.changedTouches[0].clientX
    const diff = touchStart - touchEnd

    if (Math.abs(diff) > 50) {
      if (diff > 0) goToNext()
      else goToPrevious()
    }

    setTouchStart(null)
  }

  if (images.length === 0) return null

  const currentImage = images[currentIndex]

  return (
    <div className="relative">
      {/* Main Image */}
      <div 
        className="relative aspect-video rounded-xl overflow-hidden bg-[var(--color-bg-secondary)] cursor-pointer group"
        onClick={() => onImageClick(currentImage.imageUrl, currentImage.name)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          src={currentImage.imageUrl}
          alt={currentImage.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          sizes="(max-width: 768px) 100vw, 80vw"
          priority
        />

        {/* Original Badge */}
        {currentImage.isOriginal && (
          <div className="absolute top-4 left-4 px-3 py-1 bg-[var(--color-primary)] text-white text-sm font-medium rounded-full">
            Original
          </div>
        )}

        {/* Image Name Badge */}
        {!currentImage.isOriginal && (
          <div className="absolute top-4 left-4 px-3 py-1 bg-[var(--color-accent)] text-white text-sm font-medium rounded-full">
            {currentImage.name}
          </div>
        )}

        {/* Action Buttons - Bottom Left (only for generated images) */}
        {!currentImage.isOriginal && (onRetry || onGetQuote || onDownload) && (
          <div className="absolute bottom-4 left-4 flex gap-2 z-10">
            {onRetry && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRetry(currentImage.id)
                }}
                className="px-3 py-2 bg-white hover:bg-white/95 text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center gap-1.5 border border-[var(--color-border)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry
              </button>
            )}
            {onDownload && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDownload(currentImage.id, currentImage.name, currentImage.imageUrl)
                }}
                className="px-3 py-2 bg-white hover:bg-white/95 text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center gap-1.5 border border-[var(--color-border)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            )}
            {onGetQuote && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onGetQuote(currentImage.id, currentImage.name, currentImage.imageUrl)
                }}
                className="px-3 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center gap-1.5"
              >
                Get Quote
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Expand Icon */}
        <div className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </div>

        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); goToPrevious() }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-[var(--color-text)] shadow-lg transition-all opacity-0 group-hover:opacity-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); goToNext() }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-[var(--color-text)] shadow-lg transition-all opacity-0 group-hover:opacity-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex justify-center gap-2 mt-4 overflow-x-auto pb-2">
          {images.map((image, index) => (
            <button
              key={image.id}
              onClick={() => onIndexChange(index)}
              className={`
                relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all
                ${index === currentIndex 
                  ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30' 
                  : 'border-transparent hover:border-[var(--color-border)]'
                }
              `}
            >
              <Image
                src={image.imageUrl}
                alt={image.name}
                fill
                className="object-cover"
                sizes="80px"
              />
              {image.isOriginal && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="text-white text-xs font-medium">Original</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Counter */}
      {images.length > 1 && (
        <div className="text-center mt-2 text-sm text-[var(--color-text-secondary)]">
          {currentIndex + 1} of {images.length}
        </div>
      )}
    </div>
  )
}


