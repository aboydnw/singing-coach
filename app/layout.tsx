import type { Metadata } from "next";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "Singing Coach",
  description: "Record an exercise, get measurement-backed coaching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
