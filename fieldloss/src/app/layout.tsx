import type { Metadata } from "next";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "FieldLoss — food loss, clearly recorded",
  description: "A field reporting demo for Australia and the Pacific. Capture, review and act on food losses.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}
