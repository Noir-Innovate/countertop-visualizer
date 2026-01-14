'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'

interface CarouselImage {
  id: string
  name: string
  imageUrl: string
  isOriginal?: boolean
  isLoading?: boolean
}

interface ImageCarouselProps {
  images: CarouselImage[]
  allResults?: Array<{
    slabId: string
    isLoading: boolean
    imageData: string | null
  }>
  currentIndex: number
  onIndexChange: (index: number) => void
  onImageClick: (imageUrl: string, alt: string, imageIndex: number) => void
  onGetQuote?: (imageId: string, imageName: string, imageUrl: string) => void
  onDownload?: (imageId: string, imageName: string, imageUrl: string) => void
}

export default function ImageCarousel({
  images,
  allResults = [],
  currentIndex,
  onIndexChange,
  onImageClick,
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
  const currentResult = allResults.find((r) => r.slabId === currentImage.id)
  const isLoading = currentImage.isLoading || currentResult?.isLoading

  return (
    <div className="relative">
      {/* Main Image */}
      <div 
        className={`relative aspect-video rounded-xl overflow-hidden bg-[var(--color-bg-secondary)] ${
          isLoading ? "cursor-default" : "cursor-pointer group"
        }`}
        onClick={() => {
          if (!isLoading) {
            onImageClick(currentImage.imageUrl, currentImage.name, currentIndex)
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isLoading ? (
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
            src={currentImage.imageUrl}
            alt={currentImage.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 100vw, 80vw"
            priority
          />
        )}

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

        {/* Action Buttons - Below image on mobile, overlay on desktop (only for generated images, not loading) */}
        {!currentImage.isOriginal && !isLoading && (onGetQuote || onDownload) && (
          <div className="absolute bottom-4 left-4 md:flex hidden gap-2 z-10">
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

        {/* Expand Icon - Only show for non-loading images */}
        {!isLoading && (
          <div className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </div>
        )}

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
              {image.isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg-secondary)]">
                  <svg
                    className="animate-spin h-6 w-6 text-[var(--color-accent)]"
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
                </div>
              ) : (
                <>
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
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Action Buttons - Below image on mobile (only for generated images, not loading) */}
      {!currentImage.isOriginal && !isLoading && (onGetQuote || onDownload) && (
        <div className="flex md:hidden gap-2 mt-4 justify-center">
          {onDownload && (
            <button
              onClick={() => onDownload(currentImage.id, currentImage.name, currentImage.imageUrl)}
              className="px-4 py-2 bg-white hover:bg-white/95 text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center gap-1.5 border border-[var(--color-border)]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
          )}
          {onGetQuote && (
            <button
              onClick={() => onGetQuote(currentImage.id, currentImage.name, currentImage.imageUrl)}
              className="px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center gap-1.5"
            >
              Get Quote
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          )}
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


