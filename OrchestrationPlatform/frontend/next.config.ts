import path from "node:path";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  outputFileTracingIncludes: {
    "/api/lattice/investigations/[investigationId]/copilot": ["../docs/relationships.md"],
    "/api/lattice/copilotkit/[[...path]]": ["../docs/relationships.md"],
  },
};
export default nextConfig;
