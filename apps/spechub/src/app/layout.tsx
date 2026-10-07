import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (src/app/fonts/, see the README there). With next/font/google
// every build downloaded these from Google Fonts, and a slow response failed
// the whole build — twice in one week. Variable files, latin subset, same
// variable names as before, so nothing that reads them changed.
const geistSans = localFont({
  src: "./fonts/geist.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const plusJakarta = localFont({
  src: "./fonts/plus-jakarta-sans.woff2",
  variable: "--font-plus-jakarta",
  weight: "200 800",
});

const inter = localFont({
  src: "./fonts/inter.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const sourceSerif = localFont({
  src: "./fonts/source-serif-4.woff2",
  variable: "--font-serif-display",
  weight: "200 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Product SpecHub — EnGenius",
  description:
    "Product spec management and datasheet generation for EnGenius Technologies",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} ${inter.variable} ${sourceSerif.variable} h-full`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
