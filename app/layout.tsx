import type { Metadata } from "next";
import { JetBrains_Mono, Rubik } from "next/font/google";
import "./globals.css";

const mainFont = Rubik({
  variable: "--font-main",
  subsets: ["latin"],
  weight: "400",
});

const monoFont = JetBrains_Mono({
  variable: "--font-main-mono",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Mailinator Alternative - Disposable Email",
  description: "Temporary email addresses for testing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${mainFont.variable} ${monoFont.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
