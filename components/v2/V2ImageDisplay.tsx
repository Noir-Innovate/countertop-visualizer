"use client";

interface V2ImageDisplayProps {
  currentImage: string | null;
  isGenerating: boolean;
  generatingCategory?: string;
  onChangePhoto: () => void;
}

export default function V2ImageDisplay({
  currentImage,
  isGenerating,
  generatingCategory,
  onChangePhoto,
}: V2ImageDisplayProps) {
  if (!currentImage) return null;

  const isBase64 = currentImage.startsWith("data:");
  const imgSrc = isBase64
    ? currentImage
    : `data:image/png;base64,${currentImage}`;

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-[var(--color-bg-secondary)] shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt="Kitchen visualization"
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isGenerating ? "opacity-60" : "opacity-100"
          }`}
        />

        {isGenerating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
            <div className="w-16 h-16 mb-3 relative">
              <div className="absolute inset-0 rounded-full border-4 border-white/20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white animate-spin"></div>
            </div>
            <p className="text-white font-medium text-lg drop-shadow-md">
              Applying {generatingCategory || "material"}...
            </p>
            <p className="text-white/80 text-sm mt-1 drop-shadow-md">
              This usually takes 15-30 seconds
            </p>
          </div>
        )}

        <button
          onClick={onChangePhoto}
          className="absolute top-3 right-3 px-3 py-1.5 text-sm font-medium bg-white/90 hover:bg-white text-slate-800 rounded-lg shadow-md transition-colors"
        >
          Change Photo
        </button>
      </div>
    </div>
  );
}
