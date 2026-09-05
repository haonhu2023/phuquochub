/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { HomeHero } from './HomeHero';
import { getHomeCopy } from './home.copy';
import { listPlaces } from '@/modules/places/api/places.api';

jest.mock('@/modules/places/api/places.api', () => ({ listPlaces: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockListPlaces = listPlaces as jest.Mock;

// HomeHero là async Server Component (V3: gọi listPlaces một lần cho HeroVisual) — cùng quy ước
// DiscoverPlaces.spec.tsx: gọi trực tiếp như một async function thuần rồi render JSX đã resolve,
// thay vì `render(<HomeHero />)` (React Testing Library không tự await một component trả Promise).
async function renderHero(locale?: 'vi' | 'en') {
  const jsx = await HomeHero(locale ? { locale } : {});
  return render(jsx);
}

beforeEach(() => {
  mockListPlaces.mockReset().mockResolvedValue([]);
});

describe('HomeHero', () => {
  it('có đúng MỘT h1 là tiêu đề trang (VI mặc định)', async () => {
    await renderHero();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(getHomeCopy('vi').title);
  });

  it('nêu rõ phạm vi nội dung trong lede', async () => {
    await renderHero();
    expect(screen.getByText(getHomeCopy('vi').lede)).toBeInTheDocument();
  });

  it('có eyebrow định vị sản phẩm phía trên H1', async () => {
    await renderHero();
    expect(screen.getByText(getHomeCopy('vi').eyebrow)).toBeInTheDocument();
  });

  it('có câu tín hiệu tin cậy', async () => {
    await renderHero();
    expect(screen.getByText(getHomeCopy('vi').trustSignal)).toBeInTheDocument();
  });

  // Tái dùng SearchBox: form GET thật tới /{locale}/search — hoạt động cả khi JS chưa chạy, và
  // KHÔNG có triển khai tìm kiếm thứ hai nào trên trang chủ.
  it('ô tìm kiếm là form GET điều hướng tới /vi/search (mặc định) với tham số q', async () => {
    const { container } = await renderHero();
    const form = container.querySelector('form');
    expect(form).toHaveAttribute('action', '/vi/search');
    expect(form).toHaveAttribute('method', 'get');
    expect(form?.querySelector('input[name="q"]')).toBeInTheDocument();
  });

  it('PR A: dùng đúng locale="en" khi được truyền — cả URL lẫn nội dung', async () => {
    const { container } = await renderHero('en');
    expect(container.querySelector('form')).toHaveAttribute('action', '/en/search');
    const enCopy = getHomeCopy('en');
    expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent(enCopy.title);
    expect(screen.getByText(enCopy.lede)).toBeInTheDocument();
  });

  it('ô nhập có nhãn cho trình đọc màn hình và bắt đầu rỗng', async () => {
    await renderHero();
    const input = screen.getByLabelText(getHomeCopy('vi').searchAriaLabel);
    expect(input).toHaveValue('');
  });

  // Trang chủ KHÔNG được áp sẵn bộ lọc nào lên /search — người dùng bắt đầu từ trạng thái sạch.
  it('không gửi kèm bộ lọc ẩn nào (category/ward/price_range)', async () => {
    const { container } = await renderHero();
    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0);
  });

  it('có nút gửi bấm được', async () => {
    await renderHero();
    expect(screen.getByRole('button', { name: getHomeCopy('vi').searchButton })).toBeInTheDocument();
  });

  it('mọi lối tắt theo nhu cầu trỏ tới trang duyệt CÓ THẬT, khớp locale', async () => {
    await renderHero('en');
    const copy = getHomeCopy('en');
    for (const shortcut of copy.intentShortcuts) {
      expect(screen.getByRole('link', { name: shortcut.label })).toHaveAttribute(
        'href',
        `/en${shortcut.href}`,
      );
    }
  });

  // Phase 3 (Hero V3) — composition thị giác bên phải giờ BẮT BUỘC, không còn chỉ cột trái.
  describe('HeroVisual (V3)', () => {
    it('gọi listPlaces đúng một lần, có chặn trên', async () => {
      await renderHero();
      expect(mockListPlaces).toHaveBeenCalledTimes(1);
      expect(mockListPlaces.mock.calls[0][0]).toEqual({ limit: 4 });
    });

    it('có dữ liệu thật → hiển thị tên địa điểm thật trong composition (không phải placeholder bịa)', async () => {
      mockListPlaces.mockResolvedValueOnce([
        { id: 'p1', name: 'Bãi Sao' },
        { id: 'p2', name: 'Dinh Cậu' },
      ]);
      await renderHero();
      expect(screen.getByText('Bãi Sao')).toBeInTheDocument();
      expect(screen.getByText('Dinh Cậu')).toBeInTheDocument();
    });

    it('API hỏng → KHÔNG ném lỗi, hero vẫn render đầy đủ nội dung chức năng', async () => {
      mockListPlaces.mockRejectedValueOnce(new Error('API down'));
      await renderHero();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: getHomeCopy('vi').searchButton })).toBeInTheDocument();
    });

    it('composition là trang trí (aria-hidden) — không phải nội dung/điều hướng chính', async () => {
      const { container } = await renderHero();
      expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    });
  });
});
