import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // People moved to People and companies > Team (29/10/2026). The query (?open=N) is kept.
  async redirects() {
    return [
      { source: "/settings/people", destination: "/people", permanent: false },
      { source: "/people/training", destination: "/training", permanent: false },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
