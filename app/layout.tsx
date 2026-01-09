import type { Metadata } from "next";
import { Libre_Franklin } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "./providers";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${libreFranklin.variable} font-sans antialiased`}>
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
