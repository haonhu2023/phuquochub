// Component test import CSS Modules (`*.module.css`) chỉ để lấy tên class — không cần build
// CSS thật trong Jest. Proxy trả về chính tên thuộc tính, tránh phải thêm gói identity-obj-proxy.
module.exports = new Proxy({}, { get: (_target, prop) => prop });
