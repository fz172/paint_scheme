import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AeroCanvas — Sling TSi 3D Reconstruction & Livery Studio",
  description:
    "3D Aircraft Reconstruction, Blueprint Calibration & Livery Customization Studio for General Aviation (Sling TSi)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased w-screen h-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
