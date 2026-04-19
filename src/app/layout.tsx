import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Fonts are loaded via next/font so they're self-hosted at build time —
// no layout shift, no @next/next/no-page-custom-font lint warning, and
// no runtime dependency on Google Fonts. Variables are wired into
// Tailwind's font-sans / font-mono via globals.css.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const siteUrl = "https://cmo.ie";
const ogImage = `${siteUrl}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CMO.ie - AI Search Visibility for Irish Brands",
    template: "%s - CMO.ie",
  },
  description:
    "Track how your brand appears in ChatGPT, Perplexity, Gemini and Google AI Overviews. Actionable insights to improve your AI search visibility.",
  applicationName: "CMO.ie",
  authors: [{ name: "Howl.ie" }],
  creator: "Howl.ie",
  publisher: "Howl.ie",
  keywords: [
    "AI search visibility",
    "ChatGPT brand monitoring",
    "Perplexity tracking",
    "Google AI Overviews",
    "Irish brands",
    "SEO for AI",
    "generative engine optimisation",
  ],
  openGraph: {
    type: "website",
    locale: "en_IE",
    url: siteUrl,
    siteName: "CMO.ie",
    title: "CMO.ie - AI Search Visibility for Irish Brands",
    description:
      "Track how your brand appears in ChatGPT, Perplexity, Gemini and Google AI Overviews.",
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "CMO.ie - AI Search Visibility for Irish Brands",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CMO.ie - AI Search Visibility for Irish Brands",
    description:
      "Track how your brand appears in ChatGPT, Perplexity, Gemini and Google AI Overviews.",
    images: [ogImage],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

// Tiny script that flips <html data-hydrated> as soon as the browser has
// parsed the page. Used to gate the stagger animation so it only runs once
// per page load (see globals.css). Runs before hydration so the class sticks
// for the first paint and then stays for the lifetime of the page.
const hydrationFlagScript = `
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.setAttribute("data-hydrated", "");
    });
  });
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is scoped to <html> only - it ignores attribute
    // mismatches on this single element. Needed because some mobile/desktop
    // browser extensions (reader modes, translators, remote-frame agents)
    // inject attributes like `__gcrremoteframetoken` onto <html> before
    // React hydrates, which would otherwise throw a hydration warning.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-navy text-white font-sans">
        {children}
        <script dangerouslySetInnerHTML={{ __html: hydrationFlagScript }} />
      </body>
    </html>
  );
}
