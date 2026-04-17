import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Live Puzzle – Gesture-Controlled Photo Puzzle",
  description:
    "Use your hands to define a region, and instantly turn it into a sliding puzzle. No touch required.",
  keywords: ["puzzle", "gesture", "hand tracking", "mediapipe", "AI"],
  openGraph: {
    title: "Live Puzzle",
    description: "Gesture-controlled photo puzzle experience",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
