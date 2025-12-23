import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Thot - TikTok Live Downloader',
  description: 'Thot - Liste et télécharge les lives TikTok en MP4',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className="scroll-smooth">
      <body className="antialiased">{children}</body>
    </html>
  )
}

