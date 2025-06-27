/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rilay/core', '@rilay/form-builder', '@rilay/workflow'],
};

module.exports = nextConfig;