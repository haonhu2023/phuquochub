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
 * 5. Danh tính bên vận hành đã THỰC SỰ được công bố, và khung pháp lý được viện dẫn là khung đang
 *    có hiệu lực (Luật 91/2025/QH15 + Nghị định 356/2025/NĐ-CP, từ 01/01/2026).
 * 6. Không trang nào tuyên bố đã qua rà soát của luật sư — vì chưa.
 *
 * Owner đã xác nhận và điền `operatorContact` (2026-08-16). Các assertion ở mục 5 khiến việc quay
 * lại trạng thái "chưa công bố" trở thành lỗi CI, chứ không im lặng trôi qua.
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

  it('không còn dấu ngoặc vuông kiểu mẫu điền trong giá trị danh tính', () => {
    // Owner gửi tên ở dạng "[ĐÀM VĂN HẢO]" — dấu ngoặc là ký hiệu phân cách của biểu mẫu, không
    // phải một phần của tên. Nếu chúng lọt vào đây, trang sẽ hiển thị như bản mẫu chưa điền.
    for (const value of Object.values(operatorContact)) {
      if (typeof value === 'string') expect(value).not.toMatch(/[[\]]/);
    }
  });
});

/**
 * Cổng chặn P0: danh tính bên vận hành phải THỰC SỰ được công bố.
 *
 * Đây là điểm khác biệt so với bản đầu tiên của bộ test. Trước đây các trang được phép nói "chưa
 * công bố" — trung thực, nhưng chưa đủ để mở công khai. Sau khi Owner xác nhận thông tin, việc
 * quay lại trạng thái `null` là một bước lùi và phải làm đỏ CI.
 */
describe('danh tính bên vận hành đã được công bố', () => {
  it('có email liên hệ đúng định dạng', () => {
    expect(operatorContact.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it('có tên bên chịu trách nhiệm vận hành', () => {
    expect(operatorContact.legalName).toEqual(expect.any(String));
    expect((operatorContact.legalName ?? '').trim().length).toBeGreaterThan(0);
  });

  it('có luật áp dụng cho Điều khoản', () => {
    expect(operatorContact.governingLaw).toEqual(expect.any(String));
  });

  it('nêu thời hạn phản hồi mà KHÔNG hứa một mốc cố định 30 ngày', () => {
    const responseTime = operatorContact.responseTime ?? '';
    expect(responseTime.length).toBeGreaterThan(0);
    // Owner yêu cầu rõ: không dùng mốc 30 ngày chung chung, mà trỏ về thời hạn luật định.
    expect(responseTime).not.toMatch(/30\s*ngày/i);
    expect(responseTime).toMatch(/luật định/i);
  });
});

describe('OperatorContactBlock', () => {
  it('khi chưa có liên hệ: nói rõ là chưa công bố, không bịa kênh liên hệ', () => {
    const unpublished: OperatorContact = {
      email: null,
      legalName: null,
      address: null,
      governingLaw: null,
      responseTime: null,
    };
    render(<OperatorContactBlock purpose="thực hiện quyền" contact={unpublished} />);
    expect(screen.getByText(/chưa được công bố/i)).toBeInTheDocument();
    // Không được xuất hiện link mail giả.
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('với cấu hình thật: hiển thị tên bên vận hành và link mailto trỏ đúng email', () => {
    render(<OperatorContactBlock purpose="thực hiện quyền" />);
    expect(screen.queryByText(/chưa được công bố/i)).toBeNull();
    expect(screen.getByText(operatorContact.legalName as string)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: operatorContact.email as string })).toHaveAttribute(
      'href',
      `mailto:${operatorContact.email}`,
    );
    expect(screen.getByText(operatorContact.responseTime as string)).toBeInTheDocument();
  });

  it('bỏ qua dòng địa chỉ khi Owner chưa công bố địa chỉ', () => {
    render(<OperatorContactBlock purpose="thực hiện quyền" />);
    // `address` để null có chủ đích — không được hiển thị nhãn rỗng.
    expect(screen.queryByText('Địa chỉ:')).toBeNull();
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

/**
 * Khung pháp lý được viện dẫn phải là khung ĐANG có hiệu lực.
 *
 * Nghị định 13/2023/NĐ-CP đã bị Nghị định 356/2025/NĐ-CP thay thế từ 01/01/2026. Một chính sách
 * viện dẫn văn bản đã hết hiệu lực trông có vẻ chỉn chu nhưng lại sai — nguy hiểm hơn là không
 * viện dẫn gì. Test này ghim đúng bộ văn bản hiện hành.
 */
describe('viện dẫn khung pháp lý Việt Nam hiện hành', () => {
  const src = () => readSrc('app/(public)/privacy/page.tsx');

  it('nêu Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và mốc hiệu lực 01/01/2026', () => {
    expect(src()).toMatch(/91\/2025\/QH15/);
    expect(src()).toMatch(/01\/01\/2026/);
  });

  it('nêu Nghị định 356/2025/NĐ-CP là văn bản hướng dẫn hiện hành', () => {
    expect(src()).toMatch(/356\/2025\/NĐ-CP/);
  });

  it('chỉ nhắc Nghị định 13/2023/NĐ-CP như văn bản ĐÃ BỊ THAY THẾ', () => {
    const text = src();
    if (text.includes('13/2023/NĐ-CP')) {
      expect(text).toMatch(/thay thế Nghị định số\s*\n?\s*13\/2023\/NĐ-CP/);
    }
  });
});

/**
 * Không được tuyên bố sai rằng tài liệu đã qua rà soát pháp lý — chưa hề có luật sư nào rà soát.
 */
describe('không tuyên bố đã qua rà soát pháp lý', () => {
  it.each(['app/(public)/privacy/page.tsx', 'app/(public)/terms/page.tsx'])(
    '%s nói rõ tài liệu CHƯA qua rà soát của luật sư',
    (rel) => {
      const text = readSrc(rel);
      expect(text).toMatch(/chưa được luật sư|chưa qua rà soát của luật sư/i);
      // Các cách nói ngược lại — "đã được luật sư rà soát", "đã thẩm định pháp lý" — là sai sự thật.
      expect(text).not.toMatch(/đã (được|qua) (luật sư|rà soát pháp lý|thẩm định pháp lý)/i);
    },
  );
});

describe('câu luật áp dụng ở Điều khoản không lặp chữ "pháp luật"', () => {
  it('không ghép tiền tố "pháp luật" vào trước governingLaw', () => {
    // `governingLaw` đã là "Pháp luật Việt Nam"; mẫu cũ `pháp luật {governingLaw}` sẽ in ra
    // "pháp luật Pháp luật Việt Nam".
    expect(readSrc('app/(public)/terms/page.tsx')).not.toMatch(
      /pháp luật \{operatorContact\.governingLaw\}/i,
    );
  });
});
