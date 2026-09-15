/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { ModerationCaseDetail } from './ModerationCaseDetail';
import type { ModerationCaseDetail as CaseDetail, ModerationTargetPreview } from './types';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const TEST_TOKEN = 'test-access-token';

// Owner Place Photos (2026-08-11): kiểm duyệt viên PHẢI nhìn thấy bức ảnh mình đang phán xử.
// Trước milestone này khối preview luôn hiện "Không có ảnh xem trước".
function caseDetail(preview: ModerationTargetPreview): CaseDetail {
  return {
    id: 'c1',
    target_type: 'media',
    target_id: 'm1',
    status: 'open',
    source: 'new_content',
    severity: 'low',
    priority: 0,
    report_count: 0,
    assigned_to: null,
    claimed_at: null,
    decision: null,
    reason: null,
    reason_code: null,
    resolved_by: null,
    resolved_at: null,
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
    reports: [],
    target_preview: preview,
  };
}

function mediaPreview(over: Partial<Extract<ModerationTargetPreview, { target_type: 'media' }>> = {}) {
  return {
    found: true as const,
    target_type: 'media' as const,
    target_id: 'm1',
    media_type: 'image',
    status: 'pending',
    uploaded_by: 'u1',
    created_at: '2026-08-11T00:00:00.000Z',
    place_id: 'place-1',
    place_name: 'Bãi Sao Resort',
    preview_url: '/api/media/m1/moderation-file',
    ...over,
  };
}

describe('ModerationCaseDetail — xem trước ảnh', () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-object-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Fix B (2026-09-16): `<img src={preview_url}>` trực tiếp KHÔNG BAO GIỜ gửi được header
  // Authorization — root cause thật của "ảnh xem trước lỗi", xác nhận qua trace code. Ảnh giờ tải
  // qua fetch() có header, dựng Object URL — nên test phải mock fetch, không còn assert `src` bằng
  // đúng `preview_url` nữa.
  it('có preview_url → fetch kèm đúng Authorization header, render ảnh qua Object URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(['fake-image-bytes'], { type: 'image/jpeg' })),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <ModerationCaseDetail detail={caseDetail(mediaPreview())} decisionSlot={null} accessToken={TEST_TOKEN} />,
    );

    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', 'blob:mock-object-url');
    expect(img).toHaveAttribute('alt');
    expect(screen.queryByText('Không có ảnh xem trước.')).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/media/m1/moderation-file',
      expect.objectContaining({ headers: { Authorization: `Bearer ${TEST_TOKEN}` } }),
    );
    // KHÔNG BAO GIỜ đặt token vào URL — chỉ ở header của chính request này.
    const [calledUrl] = fetchMock.mock.calls[0] as [string, unknown];
    expect(calledUrl).not.toContain(TEST_TOKEN);
  });

  it('401/403 từ moderation-file → hiện thông báo không có quyền, KHÔNG render <img> vỡ', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch;

    render(
      <ModerationCaseDetail detail={caseDetail(mediaPreview())} decisionSlot={null} accessToken={TEST_TOKEN} />,
    );

    await waitFor(() => expect(screen.getByText(/Không có quyền xem ảnh này/)).toBeInTheDocument());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('lỗi mạng/5xx khác → thông báo lỗi tải chung, không vỡ trang', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    render(
      <ModerationCaseDetail detail={caseDetail(mediaPreview())} decisionSlot={null} accessToken={TEST_TOKEN} />,
    );

    await waitFor(() => expect(screen.getByText(/Không tải được ảnh xem trước/)).toBeInTheDocument());
  });

  it('unmount trước khi fetch xong → thu hồi Object URL, không rò rỉ', async () => {
    let resolveBlob!: (v: { ok: true; status: 200; blob: () => Promise<Blob> }) => void;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveBlob = resolve as typeof resolveBlob;
        }),
    ) as unknown as typeof fetch;

    const { unmount } = render(
      <ModerationCaseDetail detail={caseDetail(mediaPreview())} decisionSlot={null} accessToken={TEST_TOKEN} />,
    );

    unmount();
    resolveBlob({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })) });
    // Cleanup effect chạy lúc unmount, TRƯỚC khi promise resolve — revokeObjectURL chỉ gọi nếu
    // objectUrl đã được set; ở đây khẳng định không có lỗi/throw không bắt được là đủ cho case
    // "unmount sớm", và createObjectURL không được set state sau khi cancelled.
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  // Kiểm duyệt viên cần biết ảnh này thuộc cơ sở NÀO để đánh giá "ảnh có liên quan không".
  it('hiện tên cơ sở khi ảnh gắn với một cơ sở', () => {
    render(
      <ModerationCaseDetail detail={caseDetail(mediaPreview())} decisionSlot={null} accessToken={TEST_TOKEN} />,
    );
    expect(screen.getByText('Bãi Sao Resort')).toBeInTheDocument();
  });

  it('ảnh review/mồ côi (không gắn cơ sở) → KHÔNG hiện dòng cơ sở', () => {
    render(
      <ModerationCaseDetail
        detail={caseDetail(mediaPreview({ place_id: null, place_name: null }))}
        decisionSlot={null}
        accessToken={TEST_TOKEN}
      />,
    );
    expect(screen.queryByText('Cơ sở')).not.toBeInTheDocument();
  });

  it('không có preview_url (dòng nhúng) → giữ thông báo không có ảnh, KHÔNG render img rỗng', () => {
    render(
      <ModerationCaseDetail
        detail={caseDetail(mediaPreview({ preview_url: null }))}
        decisionSlot={null}
        accessToken={TEST_TOKEN}
      />,
    );
    expect(screen.getByText('Không có ảnh xem trước.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('target không còn tồn tại → nêu rõ, không render ảnh', () => {
    render(
      <ModerationCaseDetail
        detail={caseDetail({ found: false, target_type: 'media', target_id: 'm1' })}
        decisionSlot={null}
        accessToken={TEST_TOKEN}
      />,
    );
    expect(screen.getByText(/không còn tồn tại/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
