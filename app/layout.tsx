import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import { DevFeedback } from "@/components/DevFeedback";

export const metadata: Metadata = {
  title: "Singing Coach",
  description:
    "Practice with a measurement-backed vocal coach and learn to hear your own singing patterns.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <DevFeedback />
      </body>
    </html>
  );
}
