import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser-only ML (圖層編輯 去背 / 智慧選取 — see components/layerEditor/models.ts)
  // is dynamically imported inside client code; keep the package and its
  // optional node backends out of the server bundle so the SSR compile
  // doesn't try to resolve onnxruntime-node / sharp through it.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Permissions-Policy', value: 'picture-in-picture=()' }] }];
  },
};

export default nextConfig;
