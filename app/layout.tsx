import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Digital Commerce Coalition",
    template: "%s | Digital Commerce Coalition",
  },
  icons: {
    icon: "/assets/logoicon.png",
  },
};

const stylesheets = [
  "/styles.css",
  "/blog.css",
  "/blog-post.css",
  "/blog-trust.css",
  "/events.css",
  "/event-detail.css",
  "/press.css",
  "/publications.css",
  "/content-detail.css",
];

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        {stylesheets.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
