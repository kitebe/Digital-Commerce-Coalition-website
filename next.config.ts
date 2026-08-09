import type { NextConfig } from "next";

const legacyPages = [
  "blog",
  "blog-post",
  "blog-trust",
  "events",
  "event",
  "event-page",
  "press",
  "press-release",
  "publications",
  "publication",
  "reports",
  "report",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": ["./legacy-html/**/*", "./public/**/*"],
  },
  async redirects() {
    return [
      {
        source: "/index.html",
        destination: "/",
        permanent: true,
      },
      ...legacyPages.map((page) => ({
        source: `/${page}.html`,
        destination: `/${page}`,
        permanent: true,
      })),
    ];
  },
};

export default nextConfig;
