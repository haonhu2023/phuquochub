/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cho phép Next transpile package workspace (types dùng chung).
  transpilePackages: ['@phuquochub/shared-types'],
};

export default nextConfig;
