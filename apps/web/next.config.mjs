// 2026-10-22 (rà soát hiệu năng — ảnh gallery/thẻ gốc 137-459KB/ảnh, không hề qua resize/nén nào) —
// cover_image_url/media.url luôn là URL TUYỆT ĐỐI (API_PUBLIC_URL + globalPrefix, xem
// MediaUrlService phía API), KHÔNG PHẢI đường dẫn tương đối. next/image's optimizer KHÔNG tự coi
// một URL tuyệt đối "cùng domain với chính nó đang chạy" là an toàn — nó CHỈ cho qua URL tương đối
// (luôn an toàn) hoặc URL tuyệt đối khớp `remotePatterns` tường minh, bất kể hostname có trùng hay
// không (xác nhận thật bằng cách gọi `/_next/image` cục bộ: bị từ chối 400 "url parameter is not
// allowed" cho tới khi thêm khối dưới đây). Lấy origin từ `NEXT_PUBLIC_API_URL` — biến build-arg ĐÃ
// có sẵn (xem Dockerfile/docker-compose.prod.yml), đúng chính xác origin mà cover_image_url/media.url
// sẽ dùng ở MỌI môi trường (dev: localhost:4000 khác cổng với web's localhost:3000 — cũng cần khối
// này y hệt production, không phải vấn đề riêng của production).
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cho phép Next transpile package workspace (types dùng chung).
  transpilePackages: ['@phuquochub/shared-types'],
  // PLACE-026 (OD2-2..9): output độc lập (chỉ file cần thiết + node_modules tối giản) để
  // đóng gói Docker image gọn nhẹ. Không đổi route/hành vi runtime — chỉ đổi cách đóng gói.
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: apiOrigin.protocol.replace(':', ''),
        hostname: apiOrigin.hostname,
        port: apiOrigin.port,
        pathname: '/api/**',
      },
    ],
  },
};

export default nextConfig;
