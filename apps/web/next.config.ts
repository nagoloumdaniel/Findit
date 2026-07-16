import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@findit/shared", "@findit/ui"],
};

export default nextConfig;
