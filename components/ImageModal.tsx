'use client'

import { useEffect, useCallback } from 'react'
import Image from 'next/image'

interface CarouselImage {
  id: string
  name: string
  imageUrl: string
  isOriginal?: boolean
}

interface ImageModalProps {
  images: CarouselImage[]
  currentIndex: number
  onIndexChange: (index: number) => void
  onClose: () => void
  onGetQuote?: (imageId: string, imageName: string, imageUrl: string) => void
  onDownload?: (imageId: string, imageName: string, imageUrl: string) => void
}

export default function ImageModal({ 
  images, 
  currentIndex, 
  onIndexChange, 
  onClose,
  onGetQuote,
  onDownload,
}: ImageModalProps) {
  const currentImage = images[currentIndex]

  const goToPrevious = useCallback(() => {
    onIndexChange(currentIndex === 0 ? images.length - 1 : currentIndex - 1)
  }, [currentIndex, images.length, onIndexChange])

  const goToNext = useCallback(() => {
    onIndexChange(currentIndex === images.length - 1 ? 0 : currentIndex + 1)
  }, [currentIndex, images.length, onIndexChange])

  // Handle escape key and arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose, goToPrevious, goToNext])

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
      onClick={onClose}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Navigation Arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goToPrevious() }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goToNext() }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Image Container */}
      <div 
        className="relative w-full max-w-6xl flex-1 flex items-center justify-center animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <Image
          src={currentImage.imageUrl}
          alt={currentImage.name}
          fill
          className="object-contain"
          sizes="100vw"
          priority
        />
      </div>

      {/* Bottom Section: Caption and Buttons */}
      <div className="w-full max-w-6xl mt-4 flex flex-col items-center gap-4">
        {/* Caption */}
        <div className="px-4 py-2 bg-black/50 rounded-lg">
          <p className="text-white text-sm text-center">{currentImage.name}</p>
          {images.length > 1 && (
            <p className="text-white/70 text-xs text-center mt-1">
              {currentIndex + 1} of {images.length}
            </p>
          )}
        </div>

        {/* Action Buttons - Only for generated images */}
        {!currentImage.isOriginal && (onGetQuote || onDownload) && (
          <div className="flex gap-3 justify-center">
            {onDownload && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDownload(currentImage.id, currentImage.name, currentImage.imageUrl)
                }}
                className="px-6 py-3 bg-white hover:bg-white/95 text-[var(--color-text)] font-semibold rounded-lg shadow-lg transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                className="px-6 py-3 bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white font-semibold rounded-lg shadow-lg transition-all flex items-center gap-2"
              >
                Get Quote
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


