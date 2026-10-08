/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportButton } from './ReportButton';
import { readSession } from '@/modules/auth/session';
import { createListingReport } from './api/listing-reports.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/listing-reports.api', () => ({ createListingReport: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockCreate = createListingReport as jest.Mock;

afterEach(() => jest.clearAllMocks());

describe('ReportButton', () => {
  it('bấm nút ban đầu → mở form với lý do mặc định', () => {
    render(<ReportButton targetType="job_listing" targetId="job-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Báo sai \/ báo trùng/ }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('chưa đăng nhập → gửi form hiện lỗi yêu cầu đăng nhập, KHÔNG gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(<ReportButton targetType="job_listing" targetId="job-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Báo sai \/ báo trùng/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Đăng nhập để báo cáo tin này.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('gửi thành công → gọi createListingReport đúng target/lý do, hiện lời cảm ơn', async () => {
    mockReadSession.mockReturnValue({ accessToken: 'tok' });
    mockCreate.mockResolvedValue({ id: 'lr-1' });
    render(<ReportButton targetType="real_estate_listing" targetId="rel-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Báo sai \/ báo trùng/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        { target_type: 'real_estate_listing', target_id: 'rel-1', reason: 'wrong_info', description: undefined },
        'tok',
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Cảm ơn bạn đã báo cáo');
  });

  it('bấm "Huỷ" đóng form, không gửi gì', () => {
    render(<ReportButton targetType="job_listing" targetId="job-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Báo sai \/ báo trùng/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.getByRole('button', { name: /Báo sai \/ báo trùng/ })).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
