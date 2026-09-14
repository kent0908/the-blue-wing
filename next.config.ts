import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser-only ML (圖層編輯 去背 / 智慧選取 — see components/layerEditor/models.ts)
  // is dynamically imported inside client code; keep the package and its
  // optional node backends out of the server bundle so the SSR compile
  // doesn't try to resolve onnxruntime-node / sharp through it.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  // One canonical host. The *.vercel.app deployment URL still answered the
  // whole site with 200 — a full duplicate in search engines' eyes.
  async redirects() {
    return [
      { source: "/:path*", has: [{ type: "host", value: "the-blue-wing.vercel.app" }], destination: "https://thebluewing.studio/:path*", permanent: true },
      { source: "/:path*", has: [{ type: "host", value: "www.thebluewing.studio" }], destination: "https://thebluewing.studio/:path*", permanent: true },
    ];
  },
  async headers() {
    // Baseline hardening for every response. No CSP yet: the layer editor
    // pulls browser ML models from the Hugging Face CDN and runs blob: workers,
    // so a policy needs its own allow-list work before it can be turned on.
    return [{ source: '/:path*', headers: [
      { key: 'Permissions-Policy', value: 'picture-in-picture=()' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ] }];
  },
};

export default nextConfig;
