import { toPlaceEditProposalSenderView } from './place-edit-proposals.mapper';

// "Góp ý của tôi": view cho người gửi không được lộ người duyệt hay ghi chú nội bộ.
describe('toPlaceEditProposalSenderView', () => {
  const row = {
    id: 'p1',
    placeId: 'pl1',
    fieldKey: 'description',
    localeCode: 'vi',
    proposedValue: 'Mô tả đề xuất synthetic',
    reason: 'Lý do synthetic',
    sourceUrl: null,
    status: 'needs_changes',
    proposerId: 'u1',
    reviewerId: 'admin-7',
    reviewedAt: new Date('2026-10-07T03:00:00Z'),
    reviewNote: 'Ghi chú nội bộ — không gửi cho người gửi',
    senderMessage: 'Cảm ơn góp ý — vui lòng bổ sung thêm giờ cuối tuần.',
    createdAt: new Date('2026-10-06T03:00:00Z'),
    updatedAt: new Date('2026-10-07T03:00:00Z'),
  } as unknown as Parameters<typeof toPlaceEditProposalSenderView>[0];

  it('giữ trạng thái và thời điểm duyệt, bỏ reviewer_id và review_note', () => {
    const view = toPlaceEditProposalSenderView(row);
    expect(view).toMatchObject({ id: 'p1', status: 'needs_changes', reviewed_at: '2026-10-07T03:00:00.000Z' });
    expect(view).not.toHaveProperty('reviewer_id');
    expect(view).not.toHaveProperty('review_note');
    expect(JSON.stringify(view)).not.toContain('admin-7');
    expect(JSON.stringify(view)).not.toContain('Ghi chú nội bộ');
  });

  // sender_message là "phản hồi public" người gửi ĐƯỢC đọc — hoàn toàn khác review_note ở trên,
  // phải CÓ MẶT đúng giá trị, không bị lọc theo cùng quy tắc "nội bộ".
  it('CÓ sender_message — khác hẳn review_note, đây là phản hồi public cho người gửi', () => {
    const view = toPlaceEditProposalSenderView(row);
    expect(view.sender_message).toBe('Cảm ơn góp ý — vui lòng bổ sung thêm giờ cuối tuần.');
  });

  it('sender_message null khi admin không viết gì', () => {
    const view = toPlaceEditProposalSenderView({ ...row, senderMessage: null });
    expect(view.sender_message).toBeNull();
  });
});
