/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
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
  it('có preview_url → render ảnh thật kèm alt, KHÔNG hiện "không có ảnh"', () => {
    render(<ModerationCaseDetail detail={caseDetail(mediaPreview())} decisionSlot={null} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/media/m1/moderation-file');
    expect(img).toHaveAttribute('alt');
    expect(screen.queryByText('Không có ảnh xem trước.')).not.toBeInTheDocument();
  });

  // Kiểm duyệt viên cần biết ảnh này thuộc cơ sở NÀO để đánh giá "ảnh có liên quan không".
  it('hiện tên cơ sở khi ảnh gắn với một cơ sở', () => {
    render(<ModerationCaseDetail detail={caseDetail(mediaPreview())} decisionSlot={null} />);
    expect(screen.getByText('Bãi Sao Resort')).toBeInTheDocument();
  });

  it('ảnh review/mồ côi (không gắn cơ sở) → KHÔNG hiện dòng cơ sở', () => {
    render(
      <ModerationCaseDetail
        detail={caseDetail(mediaPreview({ place_id: null, place_name: null }))}
        decisionSlot={null}
      />,
    );
    expect(screen.queryByText('Cơ sở')).not.toBeInTheDocument();
  });

  it('không có preview_url (dòng nhúng) → giữ thông báo không có ảnh, KHÔNG render img rỗng', () => {
    render(
      <ModerationCaseDetail
        detail={caseDetail(mediaPreview({ preview_url: null }))}
        decisionSlot={null}
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
      />,
    );
    expect(screen.getByText(/không còn tồn tại/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
