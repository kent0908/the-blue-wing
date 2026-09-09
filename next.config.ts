import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Permissions-Policy', value: 'picture-in-picture=()' }] }];
  },
};

export default nextConfig;
