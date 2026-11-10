import type { Metadata } from "next";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/chivo";
import "@fontsource-variable/ibm-plex-sans";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/toast";
import { SITE_URL } from "@/lib/siteUrl";

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
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
