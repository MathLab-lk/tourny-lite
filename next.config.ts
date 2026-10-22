import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the standalone/tracing root to the project directory. Without this,
  // Next 16 nests the standalone bundle under the app's path relative to the
  // nearest ancestor workspace (lockfile) root — which differs between
  // developer machines, CI and Docker. Pinning it keeps the runtime layout
  // identical everywhere: .next/standalone/server.js at the root.
  outputFileTracingRoot: process.cwd(),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
