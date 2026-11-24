import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // The dashboard is authenticated and loads user-scoped data in the browser, so only segments
    // that explicitly export `instant` are validated for instant navigation.
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  // Native/Node-only server packages are loaded at runtime instead of bundled.
  serverExternalPackages: ["pg", "mqtt", "bcryptjs"],
  cacheComponents: true,
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
