'use client'

import Image from 'next/image'

interface ComparisonImage {
  id: string
  name: string
  imageUrl: string
  isOriginal?: boolean
}

interface ImageComparisonProps {
  images: ComparisonImage[]
  leftIndex: number
  rightIndex: number
  onLeftIndexChange: (index: number) => void
  onRightIndexChange: (index: number) => void
  onImageClick: (imageUrl: string, alt: string, imageIndex: number) => void
  onGetQuote?: (imageId: string, imageName: string, imageUrl: string) => void
}

export default function ImageComparison({
  images,
  leftIndex,
  rightIndex,
  onLeftIndexChange,
  onRightIndexChange,
  onImageClick,
  onGetQuote,
}: ImageComparisonProps) {
  if (images.length < 2) return null

  const leftImage = images[leftIndex]
  const rightImage = images[rightIndex]

  return (
    <div className="space-y-4">
      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Image */}
        <div className="space-y-2">
          <div 
            className="relative aspect-video rounded-xl overflow-hidden bg-[var(--color-bg-secondary)] cursor-pointer group"
            onClick={() => onImageClick(leftImage.imageUrl, leftImage.name, leftIndex)}
          >
            <Image
              src={leftImage.imageUrl}
              alt={leftImage.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            
            {/* Badge */}
            <div className={`absolute top-3 left-3 px-3 py-1 text-white text-sm font-medium rounded-full ${
              leftImage.isOriginal ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-accent)]'
            }`}>
              {leftImage.isOriginal ? 'Original' : leftImage.name}
            </div>
          </div>

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

          {/* Get Quote Button - only for non-original */}
          {!leftImage.isOriginal && onGetQuote && (
            <button
              onClick={() => onGetQuote(leftImage.id, leftImage.name, leftImage.imageUrl)}
              className="w-full px-3 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center gap-1.5"
            >
              Get Quote
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          )}
        </div>

        {/* Right Image */}
        <div className="space-y-2">
          <div 
            className="relative aspect-video rounded-xl overflow-hidden bg-[var(--color-bg-secondary)] cursor-pointer group"
            onClick={() => onImageClick(rightImage.imageUrl, rightImage.name, rightIndex)}
          >
            <Image
              src={rightImage.imageUrl}
              alt={rightImage.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            
            {/* Badge */}
            <div className={`absolute top-3 left-3 px-3 py-1 text-white text-sm font-medium rounded-full ${
              rightImage.isOriginal ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-accent)]'
            }`}>
              {rightImage.isOriginal ? 'Original' : rightImage.name}
            </div>
          </div>

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

          {/* Get Quote Button - only for non-original */}
          {!rightImage.isOriginal && onGetQuote && (
            <button
              onClick={() => onGetQuote(rightImage.id, rightImage.name, rightImage.imageUrl)}
              className="w-full px-3 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center gap-1.5"
            >
              Get Quote
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center text-sm text-[var(--color-text-secondary)]">
        Select different images from the dropdowns to compare side by side
      </p>
    </div>
  )
}


