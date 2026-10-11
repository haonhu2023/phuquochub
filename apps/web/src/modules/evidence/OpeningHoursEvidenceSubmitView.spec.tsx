/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OpeningHoursEvidenceSubmitView } from './OpeningHoursEvidenceSubmitView';
import { previewPlace } from '@/modules/place-management/api/place-management.api';
import { submitOpeningHoursEvidence } from './api/opening-hours-evidence.api';
import { readSession } from '@/modules/auth/session';

jest.mock('@/modules/place-management/api/place-management.api', () => ({ previewPlace: jest.fn() }));
jest.mock('./api/opening-hours-evidence.api', () => ({ submitOpeningHoursEvidence: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const mockPreview = previewPlace as jest.Mock;
const mockSubmit = submitOpeningHoursEvidence as jest.Mock;
const mockSession = readSession as jest.Mock;

beforeEach(() => {
  mockSession.mockReset().mockReturnValue({ accessToken: 'tok' });
  mockPreview.mockReset();
  mockSubmit.mockReset();
});

it('place chưa có opening_hours nào → KHÔNG hiện form nộp, chỉ hiện gợi ý nhập giờ trước', async () => {
  mockPreview.mockResolvedValue({ name: 'Nhà hàng A', opening_hours: {} });
  render(<OpeningHoursEvidenceSubmitView placeId="place-1" />);

  expect(await screen.findByText(/chưa nhập giờ mở cửa nào/)).toBeInTheDocument();
  expect(screen.queryByText('Nộp bằng chứng')).not.toBeInTheDocument();
});

it('place có opening_hours → hiện form, nộp thành công hiện thông báo chờ duyệt', async () => {
  mockPreview.mockResolvedValue({
    name: 'Nhà hàng A',
    opening_hours: { regular: { mon: [{ open: '09:00', close: '17:00' }] } },
  });
  mockSubmit.mockResolvedValue({ evidence_artifact_id: 'evd-1', place_id: 'place-1', verification_status: 'NEEDS_REVIEW' });

  render(<OpeningHoursEvidenceSubmitView placeId="place-1" />);

  await screen.findByText('Bằng chứng mới');
  fireEvent.change(screen.getByLabelText('URL nguồn'), { target: { value: 'https://example.com/hours' } });
  fireEvent.change(screen.getByLabelText(/Nội dung chép lại nguyên văn/), { target: { value: '9h-17h thứ 2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Nộp bằng chứng' }));

  await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(
    'place-1',
    expect.objectContaining({ source_url: 'https://example.com/hours', observed_text: '9h-17h thứ 2', schedule_stability: 'STABLE' }),
    'tok',
  ));
  expect(await screen.findByText(/đang chờ moderator xét duyệt/)).toBeInTheDocument();
});

it('thiếu URL/nội dung → không gọi API, hiện lỗi', async () => {
  mockPreview.mockResolvedValue({
    name: 'Nhà hàng A',
    opening_hours: { regular: { mon: [{ open: '09:00', close: '17:00' }] } },
  });
  render(<OpeningHoursEvidenceSubmitView placeId="place-1" />);

  await screen.findByText('Bằng chứng mới');
  fireEvent.click(screen.getByRole('button', { name: 'Nộp bằng chứng' }));

  expect(await screen.findByText(/Vui lòng nhập đủ URL nguồn/)).toBeInTheDocument();
  expect(mockSubmit).not.toHaveBeenCalled();
});
