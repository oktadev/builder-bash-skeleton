import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Server-only env vars are intentionally NOT exposed to the client.
  // The token-exchange flow runs entirely server-side; the browser only
  // ever sees the iron-session cookie.
  reactStrictMode: true,
};

export default nextConfig;
