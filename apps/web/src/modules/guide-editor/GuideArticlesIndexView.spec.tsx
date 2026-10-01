/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { GuideArticlesIndexView } from './GuideArticlesIndexView';
import { listGuideDrafts } from './api/guide-editor.api';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';

jest.mock('./api/guide-editor.api', () => ({ listGuideDrafts: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/auth/api/me.api', () => ({ fetchCapabilities: jest.fn() }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const session = readSession as jest.Mock;
const caps = fetchCapabilities as jest.Mock;
const list = listGuideDrafts as jest.Mock;

beforeEach(() => {
  session.mockReset().mockReturnValue({ accessToken: 'tok' });
  caps.mockReset().mockResolvedValue({ canEditGuides: true });
  list.mockReset().mockResolvedValue([]);
});

it('trang cẩm nang mở được và nối đến form tạo bản nháp', async () => {
  render(<GuideArticlesIndexView />);
  expect(await screen.findByRole('link', { name: /Tạo cẩm nang/ })).toHaveAttribute('href', '/dashboard/editorial/guides/new');
  expect(screen.getByText(/Chưa có bài viết nào/)).toBeInTheDocument();
});

it('có quyền thì liệt kê bài, kể cả bản nháp, với đường sửa đúng ID', async () => {
  list.mockResolvedValue([{ id: 'id1', slug: 'cam-nang', locale: 'vi', title: 'Cẩm nang Phú Quốc', status: 'draft', updatedAt: '2026-09-26' }]);
  render(<GuideArticlesIndexView />);
  expect(await screen.findByRole('link', { name: /Cẩm nang Phú Quốc/ })).toHaveAttribute('href', '/dashboard/editorial/guides/id1');
  expect(list).toHaveBeenCalledWith('tok');
});

it('từ chối hiển thị bài khi không có quyền', async () => {
  caps.mockResolvedValue({ canEditGuides: false });
  render(<GuideArticlesIndexView />);
  expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền');
  expect(list).not.toHaveBeenCalled();
});
