import type { Metadata } from "next";
import { Libre_Franklin } from "next/font/google";
import "./globals.css";
import { PostHogProvider, MaterialLineProviderWrapper } from "./providers";
import { getMaterialLineFromHeaders, generateThemeStyles } from "@/lib/material-line-server";

const libreFranklin = Libre_Franklin({
  variable: "--font-libre-franklin",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Countertop Visualizer | See Your Dream Countertops",
  description: "Visualize your dream countertops with AI. Upload a photo of your kitchen and see how different countertop materials would look.",
  keywords: ["countertop", "visualizer", "kitchen", "AI", "marble", "granite", "quartz"],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const materialLine = await getMaterialLineFromHeaders();
  const themeStyles = generateThemeStyles(materialLine);

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
      </head>
      <body className={`${libreFranklin.variable} font-sans antialiased`}>
        <PostHogProvider>
          <MaterialLineProviderWrapper materialLine={materialLine}>
            {children}
          </MaterialLineProviderWrapper>
        </PostHogProvider>
      </body>
    </html>
  );
}
