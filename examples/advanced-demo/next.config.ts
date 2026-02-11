/** @type {import('next').NextConfig} */
import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  experimental: {
  },
  cacheComponents: true,
  reactCompiler: true,
  poweredByHeader: false,
  enablePrerenderSourceMaps: true,
  webpack: (config) => {
    // Handle the scope-state local package
    config.resolve.alias = {
      ...config.resolve.alias,
      'scope-state': path.resolve(process.cwd(), '../../src/index.ts'),
    };
    return config;
  },
  turbopack: {
    root: path.resolve(process.cwd(), '../../'),
    resolveAlias: {
      'scope-state': path.resolve(process.cwd(), '../../src/index.ts'),
    },
  },
};

export default nextConfig; 