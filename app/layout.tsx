import type { Metadata } from "next";
import { Libre_Franklin } from "next/font/google";
import "./globals.css";
import { PostHogProvider, MaterialLineProviderWrapper } from "./providers";
import { getMaterialLineFromHeaders } from "@/lib/material-line-server";
import ThemeInjector from "@/components/ThemeInjector";

const libreFranklin = Libre_Franklin({
  variable: "--font-libre-franklin",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Countertop Visualizer | See Your Dream Countertops",
  description:
    "Visualize your dream countertops with AI. Upload a photo of your kitchen and see how different countertop materials would look.",
  keywords: [
    "countertop",
    "visualizer",
    "kitchen",
    "AI",
    "marble",
    "granite",
    "quartz",
  ],
};

// Force dynamic rendering to prevent caching (especially important for localhost)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const materialLine = await getMaterialLineFromHeaders();

  return (
    <html lang="en">
      <body className={`${libreFranklin.variable} font-sans antialiased`}>
        <PostHogProvider>
          <MaterialLineProviderWrapper materialLine={materialLine}>
            <ThemeInjector />
            {children}
          </MaterialLineProviderWrapper>
        </PostHogProvider>
      </body>
    </html>
  );
}
