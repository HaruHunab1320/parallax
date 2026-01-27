/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  },
  // Enable strict mode for better error catching
  reactStrictMode: true,
  // Disable x-powered-by header
  poweredByHeader: false,
};

module.exports = nextConfig;
