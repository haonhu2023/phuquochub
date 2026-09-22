// N2 (launch-readiness pass, 2026-09-22) — trang Hướng dẫn TĨNH, viết tay, mô tả ĐÚNG các luồng
// đã có trong sản phẩm (địa điểm, ảnh, bài viết, nội dung website, xung đột) — không phải một hệ
// thống tài liệu/knowledge-base mới, không CMS, không route con nào khác ngoài trang này. Nội dung
// khớp với hành vi THẬT của từng màn hình liên quan (PlaceForm.tsx, PhotosView.tsx,
// GuideArticleEditorView.tsx, SiteContentView.tsx) — không hứa tính năng chưa tồn tại (ví dụ:
// không nhắc trạng thái sao lưu, vì trang đó chưa được xây — xem BK1 trong kế hoạch).
import type { ReactNode } from 'react';

export const metadata = { title: 'Hướng dẫn — PhuQuocHub' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>{title}</h2>
      {children}
    </section>
  );
}

export default function DashboardHelpPage() {
  return (
    <main style={{ maxWidth: 720 }}>
      <h1>Hướng dẫn</h1>
      <p style={{ color: 'var(--muted)' }}>
        Các bước thao tác chính trong bảng điều khiển. Trang này chỉ mô tả những gì tài khoản của
        bạn thực sự dùng được — nếu không thấy một mục nào đó, tài khoản của bạn chưa có quyền cho
        mục đó.
      </p>

      <Section title="1. Tạo và sửa địa điểm">
        <p>
          Vào <strong>Địa điểm</strong> ở thanh điều hướng trên cùng để xem danh sách địa điểm của
          bạn. Tạo mới xong, hệ thống đưa bạn thẳng vào trang sửa — điền các trường (tên, danh mục,
          vị trí, mô tả, giờ mở cửa…) rồi bấm lưu.
        </p>
        <p>
          Nếu tài khoản của bạn có quyền tự xuất bản, địa điểm mới sẽ ở trạng thái <em>nháp</em>{' '}
          (chưa ai thấy ngoài bạn) cho tới khi bạn bấm <strong>Xuất bản</strong>. Nếu chưa có quyền
          đó, địa điểm sẽ chờ duyệt. Trước khi xuất bản, dùng nút <strong>Xem trước</strong> để xem
          đúng những gì khách sẽ thấy.
        </p>
        <p>
          Muốn gỡ một địa điểm đã xuất bản khỏi trang công khai (nhưng vẫn giữ lại để sửa tiếp), bấm{' '}
          <strong>Gỡ công khai</strong> — khác với <em>Lưu trữ</em>, hành động này hồi lại được bất
          cứ lúc nào bằng cách xuất bản lại.
        </p>
      </Section>

      <Section title="2. Thêm và quản lý ảnh">
        <p>
          Trong trang sửa địa điểm, mở mục ảnh để tải ảnh lên. Ảnh mới luôn ở trạng thái chờ duyệt;
          nếu tài khoản của bạn có quyền duyệt ảnh, bạn tự duyệt được ngay. Chỉ ảnh đã duyệt mới đặt
          được làm <strong>ảnh bìa</strong>.
        </p>
        <p>
          Gỡ một ảnh đang là ảnh bìa sẽ khiến địa điểm tạm thời không có ảnh bìa cho tới khi bạn đặt
          ảnh khác — hệ thống sẽ cảnh báo rõ điều này trước khi bạn xác nhận gỡ.
        </p>
      </Section>

      <Section title="3. Viết và xuất bản bài viết (cẩm nang)">
        <p>
          Mục <strong>Bài viết</strong> chỉ hiện nếu tài khoản của bạn có quyền biên tập cẩm nang.
          Tạo bài mới, thêm từng khối nội dung (đoạn văn, ảnh, câu hỏi thường gặp…), chọn ảnh trực
          tiếp bằng cách tải file lên — không cần tự nhập mã ảnh.
        </p>
        <p>
          Bài viết ở trạng thái nháp cho tới khi bạn bấm <strong>Xuất bản</strong>; muốn gỡ khỏi
          trang công khai, bấm <strong>Gỡ công khai</strong> để đưa về nháp mà không mất nội dung đã
          viết.
        </p>
      </Section>

      <Section title="4. Sửa nội dung trang chủ">
        <p>
          Mục <strong>Nội dung website</strong> chỉ hiện nếu tài khoản của bạn có quyền đó. Khác với
          địa điểm và bài viết, phần này <strong>không có bản nháp</strong> — mỗi lần bấm{' '}
          <strong>Cập nhật công khai</strong>, nội dung áp dụng lên trang chủ NGAY LẬP TỨC. Kiểm tra
          kỹ trước khi bấm.
        </p>
      </Section>

      <Section title="5. Khi có thông báo xung đột">
        <p>
          Nếu bạn thấy thông báo dạng &quot;vừa được người khác sửa/cập nhật&quot;, nghĩa là ai đó
          đã lưu một thay đổi khác cho đúng mục bạn đang sửa, trong lúc bạn vẫn đang mở trang đó.
          Hệ thống <strong>không tự ghi đè</strong> theo bất kỳ hướng nào — nội dung bạn đang gõ vẫn
          còn nguyên trên form, chưa bị mất.
        </p>
        <p>
          Với nội dung trang chủ, bạn có thể bấm <strong>Tải phiên bản mới nhất</strong> ngay tại
          chỗ rồi thử lưu lại. Với địa điểm và bài viết, tải lại trang để xem bản mới nhất, rồi nhập
          lại các thay đổi của bạn trước khi lưu.
        </p>
      </Section>
    </main>
  );
}
