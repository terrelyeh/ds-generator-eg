import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo: deps hoist to the repo-root node_modules; point file tracing
  // at the workspace root so serverless bundles still pick them up.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Workspace packages ship raw .ts — Next transpiles them in-place.
  transpilePackages: ["@eg/db", "@eg/auth"],
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
  experimental: {
    // Same client-router cache window as SpecHub: bouncing between
    // knowledge/settings pages reuses the rendered payload for 30s;
    // mutation sites call router.refresh() which busts it immediately.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
