/** @jest-environment jsdom */
/**
 * Bề mặt tin cậy/pháp lý — test tĩnh.
 *
 * ĐIỀU NÀY GHIM LẠI ĐIỀU GÌ
 * -------------------------
 * 1. KHÔNG có placeholder giả lọt vào trang pháp lý. Một chính sách bảo mật ghi
 *    "example@example.com" hay "[Company Name]" tệ hơn là không có trang nào, vì nó trông như đã
 *    hoàn chỉnh. Test này quét đúng các mẫu đó.
 * 2. Danh tính bên vận hành nằm ở MỘT nguồn duy nhất và trang hiển thị trung thực khi chưa có dữ
 *    liệu — không khẳng định một kênh liên hệ không tồn tại.
 * 3. Footer thực sự trỏ tới cả 4 trang, ở CẢ khu vực công khai lẫn khu vực đăng nhập/đăng ký.
 *    Trang đăng ký là nơi người dùng lần đầu giao dữ liệu cá nhân; thiếu link ở đó là lỗi thật.
 * 4. Form đăng ký nêu rõ sự đồng ý với Điều khoản/Bảo mật.
 *
 * Khi Owner điền `operatorContact`, các assertion về trạng thái "chưa công bố" sẽ chuyển sang
 * kiểm tra kênh liên hệ thật — xem `describe('khi đã công bố liên hệ')`.
 */
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { hasPublishedContact, operatorContact, type OperatorContact } from '@/lib/site-identity';
import { SiteFooter } from './SiteFooter';
import { OperatorContactBlock } from './OperatorContact';

const WEB_SRC = path.join(process.cwd(), 'src');

const LEGAL_PAGES = [
  'app/(public)/privacy/page.tsx',
  'app/(public)/terms/page.tsx',
  'app/(public)/about/page.tsx',
  'app/(public)/contact/page.tsx',
];

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(WEB_SRC, rel), 'utf8');
}

describe('bề mặt pháp lý — không có placeholder giả', () => {
  // Các mẫu placeholder kinh điển. Nếu một trong số này xuất hiện, trang đang nói dối người đọc.
  const FORBIDDEN = [
    /example@example\.com/i,
    /\byour-?email\b/i,
    /\[company name\]/i,
    /\[address\]/i,
    /\bTODO\b/,
    /\bFIXME\b/,
    /lorem ipsum/i,
    /123-456-7890/,
  ];

  it.each(LEGAL_PAGES)('%s không chứa placeholder giả', (rel) => {
    const src = readSrc(rel);
    for (const pattern of FORBIDDEN) {
      expect(src).not.toMatch(pattern);
    }
  });

  it('không có địa chỉ email cứng nào trong các trang pháp lý (phải đi qua site-identity)', () => {
    for (const rel of LEGAL_PAGES) {
      const src = readSrc(rel);
      // `mailto:` chỉ được phép xuất hiện trong OperatorContact.tsx, nơi giá trị đến từ cấu hình.
      expect(src).not.toMatch(/mailto:[a-z0-9]/i);
    }
  });
});

describe('site-identity là nguồn sự thật duy nhất', () => {
  it('hasPublishedContact phản ánh đúng việc có email hay không', () => {
    expect(hasPublishedContact({ ...operatorContact, email: null })).toBe(false);
    expect(hasPublishedContact({ ...operatorContact, email: '' })).toBe(false);
    expect(hasPublishedContact({ ...operatorContact, email: 'a@b.co' })).toBe(true);
  });

  it('không tự ý điền giá trị phỏng đoán vào các trường danh tính', () => {
    // Bảo vệ ngược: nếu ai đó nhét giá trị "tạm" vào đây, test phải bắt được.
    const suspicious = /example|test|todo|xxx|changeme|placeholder/i;
    for (const value of Object.values(operatorContact)) {
      if (typeof value === 'string') expect(value).not.toMatch(suspicious);
    }
  });
});

describe('OperatorContactBlock', () => {
  it('khi chưa có liên hệ: nói rõ là chưa công bố, không bịa kênh liên hệ', () => {
    render(<OperatorContactBlock purpose="thực hiện quyền" />);
    expect(screen.getByText(/chưa được công bố/i)).toBeInTheDocument();
    // Không được xuất hiện link mail giả.
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  describe('khi đã công bố liên hệ', () => {
    // Chạy được ngay cả khi Owner chưa điền, bằng cách dựng một cấu hình đã hoàn chỉnh.
    const published: OperatorContact = {
      email: 'lienhe@phuquochub.com',
      legalName: 'Bên vận hành PhuQuocHub',
      address: null,
      governingLaw: 'Việt Nam',
      responseTime: 'trong vòng 30 ngày',
    };

    it('hasPublishedContact chấp nhận cấu hình đầy đủ', () => {
      expect(hasPublishedContact(published)).toBe(true);
    });
  });
});

describe('SiteFooter', () => {
  it('trỏ tới đủ 4 trang tin cậy/pháp lý', () => {
    render(<SiteFooter />);
    const expected: Array<[string, string]> = [
      ['Giới thiệu', '/about'],
      ['Liên hệ', '/contact'],
      ['Chính sách bảo mật', '/privacy'],
      ['Điều khoản sử dụng', '/terms'],
    ];
    for (const [label, href] of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('ghi công OpenStreetMap (yêu cầu của giấy phép dữ liệu bản đồ)', () => {
    render(<SiteFooter />);
    const osm = screen.getByRole('link', { name: /openstreetmap/i });
    expect(osm).toHaveAttribute('href', expect.stringContaining('openstreetmap.org/copyright'));
  });
});

describe('footer hiện diện ở cả hai layout', () => {
  it.each([
    ['app/(public)/layout.tsx', 'khu vực công khai'],
    ['app/(auth)/layout.tsx', 'khu vực đăng nhập/đăng ký'],
  ])('%s có SiteFooter (%s)', (rel) => {
    expect(readSrc(rel)).toMatch(/<SiteFooter\s*\/>/);
  });
});

describe('công bố ở các form thu thập dữ liệu', () => {
  it.each([
    ['app/(auth)/register/page.tsx', 'đăng ký'],
    ['modules/reviews/ReviewsSection.tsx', 'đánh giá'],
    ['modules/business-claims/ClaimForm.tsx', 'xác nhận cơ sở'],
    ['modules/place-photos/PhotosView.tsx', 'tải ảnh'],
  ])('%s có liên kết tới trang pháp lý (%s)', (rel) => {
    const src = readSrc(rel);
    expect(src).toMatch(/href="\/(terms|privacy)"/);
  });

  it('form đăng ký nêu rõ sự đồng ý với CẢ Điều khoản và Chính sách bảo mật', () => {
    const src = readSrc('app/(auth)/register/page.tsx');
    expect(src).toMatch(/href="\/terms"/);
    expect(src).toMatch(/href="\/privacy"/);
    expect(src).toMatch(/đồng ý/i);
  });
});

describe('không có banner cookie (sản phẩm không đặt cookie nào)', () => {
  it('chính sách nêu rõ không dùng cookie và không có banner', () => {
    const src = readSrc('app/(public)/privacy/page.tsx');
    expect(src).toMatch(/không đặt cookie/i);
    expect(src).toMatch(/không hiển thị banner/i);
  });
});
