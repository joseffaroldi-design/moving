import type { Metadata } from "next";
import { Playfair_Display, Chivo, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/toast";
import { SITE_URL } from "@/lib/siteUrl";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-playfair",
  display: "swap",
});

const chivo = Chivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chivo",
  display: "swap",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Southern Magnolia Movers — Operations",
  description:
    "Southern Magnolia Movers operations platform: leads, quotes, jobs, dispatch, and crew. Moving You Forward.",
  icons: {
    icon: "/brand/favicon.png",
    apple: "/brand/favicon.png",
  },
  // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION to your Search Console HTML-tag token
  // to emit the <meta name="google-site-verification"> tag (omitted when unset).
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${chivo.variable} ${plex.variable}`}
    >
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
