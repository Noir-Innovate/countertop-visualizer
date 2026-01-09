import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow data URLs for base64 images
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Unoptimized for base64 data URLs
    unoptimized: false,
    remotePatterns: [
      // Add any external image hosts here if needed
    ],
  },
  // Increase serverless function timeout for AI generation
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
