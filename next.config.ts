import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg is a Node-only dependency used by server components/actions.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
