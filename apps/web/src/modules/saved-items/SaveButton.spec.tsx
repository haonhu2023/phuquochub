/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveButton } from './SaveButton';
import { readSession } from '@/modules/auth/session';
import { saveItem, unsaveItem } from './api/saved-items.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/saved-items.api', () => ({ saveItem: jest.fn(), unsaveItem: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockSave = saveItem as jest.Mock;
const mockUnsave = unsaveItem as jest.Mock;

afterEach(() => jest.clearAllMocks());

describe('SaveButton', () => {
  it('chưa đăng nhập → bấm hiện thông báo yêu cầu đăng nhập, KHÔNG gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(<SaveButton targetType="job_listing" targetId="job-1" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Đăng nhập để lưu tin này.');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('bấm lần đầu → gọi saveItem đúng target, đổi nhãn thành "Đã lưu"', async () => {
    mockReadSession.mockReturnValue({ accessToken: 'tok' });
    mockSave.mockResolvedValue(undefined);
    render(<SaveButton targetType="real_estate_listing" targetId="rel-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Lưu tin/ }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith('real_estate_listing', 'rel-1', 'tok'));
    expect(await screen.findByRole('button', { name: /Đã lưu/ })).toBeInTheDocument();
  });

  it('bấm lần hai (đã lưu) → gọi unsaveItem, đổi nhãn về "Lưu tin"', async () => {
    mockReadSession.mockReturnValue({ accessToken: 'tok' });
    mockSave.mockResolvedValue(undefined);
    mockUnsave.mockResolvedValue(undefined);
    render(<SaveButton targetType="job_listing" targetId="job-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Lưu tin/ }));
    await screen.findByRole('button', { name: /Đã lưu/ });
    fireEvent.click(screen.getByRole('button', { name: /Đã lưu/ }));
    await waitFor(() => expect(mockUnsave).toHaveBeenCalledWith('job_listing', 'job-1', 'tok'));
    expect(await screen.findByRole('button', { name: /Lưu tin/ })).toBeInTheDocument();
  });
});
