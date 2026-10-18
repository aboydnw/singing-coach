import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { APP_THEME_COLOR } from "@/app/manifest";
import { Providers } from "@/app/providers";
import { DevFeedback } from "@/components/DevFeedback";

export const metadata: Metadata = {
  title: "Singing Coach",
  description:
    "Practice with a measurement-backed vocal coach and learn to hear your own singing patterns.",
  applicationName: "Singing Coach",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/app-icon.svg",
    apple: "/apple-icon",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Singing Coach",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: APP_THEME_COLOR,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <DevFeedback />
        <Analytics />
      </body>
    </html>
  );
}
