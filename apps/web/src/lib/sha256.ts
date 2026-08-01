// SHA-256 hex digest của một File, dùng client-side trước khi presign upload (Media Upload
// Foundation yêu cầu checksum_sha256 do client tự tính — server xác thực lại từ chính object đã
// lưu, không tin giá trị này, nhưng vẫn bắt buộc phải gửi kèm ở bước presign).
export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
