/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    appDir: true,
  },
  webpack: (config) => {
    // Handle the scope-state local package
    config.resolve.alias = {
      ...config.resolve.alias,
      'scope-state': require('path').resolve(__dirname, '../../src/index.ts'),
    };
    return config;
  },
};

module.exports = nextConfig; 