import type { NextConfig } from "next";

const legacyPages = [
  "blog",
  "blog-post",
  "blog-trust",
  "events",
  "event",
  "press",
  "publications",
  "publication",
  "reports",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
