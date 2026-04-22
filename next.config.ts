import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
  experimental: {
    // Cache dynamic routes in the client router for 30s so bouncing
    // between dashboard and product detail feels instant. Next.js 15+
    // defaults dynamic to 0 (always re-render on back), which made
    // PMs see loading.tsx every time they navigated back from a
    // product page. Mutation sites (save translation, generate PDF,
    // layout-ack, resync) all call router.refresh() which busts this
    // cache immediately — so the 30s window only papers over
    // read-only round trips.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
