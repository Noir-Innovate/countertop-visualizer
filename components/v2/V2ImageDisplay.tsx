"use client";

interface V2ImageDisplayProps {
  currentImage: string | null;
  isGenerating: boolean;
  generatingCategory?: string;
  onChangePhoto: () => void;
  showDownloadShare?: boolean;
  onDownload?: () => void;
  onShare?: () => void;
  shareFeedback?: string | null;
  shareFeedbackType?: "success" | "error" | null;
}

export default function V2ImageDisplay({
  currentImage,
  isGenerating,
  generatingCategory,
  onChangePhoto,
  showDownloadShare = false,
  onDownload,
  onShare,
  shareFeedback,
  shareFeedbackType,
}: V2ImageDisplayProps) {
  if (!currentImage) return null;

  const isBase64 = currentImage.startsWith("data:");
  const imgSrc = isBase64
    ? currentImage
    : `data:image/png;base64,${currentImage}`;

  const showActions =
    showDownloadShare && !isGenerating && (onDownload || onShare);

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

        {showActions && (
          <div className="absolute bottom-4 left-4 hidden md:flex gap-2 z-10">
            {onDownload && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                className="cursor-pointer px-3 py-2 bg-white text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:shadow-md flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-accent)]/40"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span className="hidden md:inline">Download</span>
              </button>
            )}
            {onShare && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShare();
                }}
                className="cursor-pointer px-3 py-2 bg-white text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:shadow-md flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-accent)]/40"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                <span className="hidden md:inline">Share</span>
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onChangePhoto}
          className="absolute top-3 right-3 px-3 py-1.5 text-sm font-medium bg-white/90 hover:bg-white text-slate-800 rounded-lg shadow-md transition-colors"
        >
          Change Photo
        </button>
      </div>

      {showActions && (
        <div className="flex md:hidden gap-2 mt-4 justify-center px-2">
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="cursor-pointer px-3 py-2 bg-white text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:shadow-md flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-accent)]/40"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </button>
          )}
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              className="cursor-pointer px-3 py-2 bg-white text-[var(--color-text)] text-sm font-semibold rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:shadow-md flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-accent)]/40"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      {shareFeedback && (
        <p
          className={`mt-2 text-center text-sm px-2 ${
            shareFeedbackType === "success"
              ? "text-green-700"
              : "text-red-600"
          }`}
        >
          {shareFeedback}
        </p>
      )}
    </div>
  );
}
