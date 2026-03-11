import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["@parallaxai/pattern-builder"],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@parallaxai/pattern-builder": resolve(
        __dirname,
        "../../packages/pattern-builder/src/index.tsx"
      ),
    };
    return config;
  },
};

export default nextConfig;
