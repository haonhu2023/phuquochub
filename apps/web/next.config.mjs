/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cho phép Next transpile package workspace (types dùng chung).
  transpilePackages: ['@phuquochub/shared-types'],
  // PLACE-026 (OD2-2..9): output độc lập (chỉ file cần thiết + node_modules tối giản) để
  // đóng gói Docker image gọn nhẹ. Không đổi route/hành vi runtime — chỉ đổi cách đóng gói.
  output: 'standalone',
};

export default nextConfig;
