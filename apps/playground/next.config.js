/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rilaykit/core', '@rilaykit/forms', '@rilaykit/workflow'],
};

module.exports = nextConfig;