import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon; tell Next.js to load it from node_modules
  // rather than bundling it, so the native .node file is available at runtime.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
