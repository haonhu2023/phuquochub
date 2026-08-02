import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DecideModerationCaseDto, ListModerationCasesQueryDto } from './moderation.dto';

const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateQuery(raw: Record<string, unknown>) {
  return validate(plainToInstance(ListModerationCasesQueryDto, raw), PIPE_OPTIONS);
}

function validateDecide(raw: Record<string, unknown>) {
  return validate(plainToInstance(DecideModerationCaseDto, raw), PIPE_OPTIONS);
}

describe('ListModerationCasesQueryDto', () => {
  it('chấp nhận query rỗng (mọi trường tuỳ chọn)', async () => {
    const errors = await validateQuery({});
    expect(errors).toHaveLength(0);
  });

  it('chấp nhận đủ 5 filter đã tài liệu hoá + phân trang', async () => {
    const errors = await validateQuery({
      status: 'open',
      target_type: 'media',
      source: 'new_content',
      severity: 'normal',
      assigned_to: '11111111-1111-4111-8111-111111111111',
      page: 2,
      limit: 50,
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối status không thuộc moderation_case_status', async () => {
    const errors = await validateQuery({ status: 'archived' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('từ chối target_type không thuộc moderation_target_type', async () => {
    const errors = await validateQuery({ target_type: 'comment' });
    expect(errors.some((e) => e.property === 'target_type')).toBe(true);
  });

  it('từ chối source không thuộc moderation_case_source', async () => {
    const errors = await validateQuery({ source: 'unknown' });
    expect(errors.some((e) => e.property === 'source')).toBe(true);
  });

  it('từ chối severity không thuộc moderation_case_severity', async () => {
    const errors = await validateQuery({ severity: 'urgent' });
    expect(errors.some((e) => e.property === 'severity')).toBe(true);
  });

  it('từ chối assigned_to không phải UUID', async () => {
    const errors = await validateQuery({ assigned_to: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'assigned_to')).toBe(true);
  });

  it('từ chối page/limit không phải số nguyên dương', async () => {
    const errorsPage = await validateQuery({ page: 0 });
    expect(errorsPage.some((e) => e.property === 'page')).toBe(true);

    const errorsLimit = await validateQuery({ limit: -1 });
    expect(errorsLimit.some((e) => e.property === 'limit')).toBe(true);
  });

  it('từ chối trường không thuộc hợp đồng (không phát minh filter, vd date_from/sort_by)', async () => {
    const errors = await validateQuery({ date_from: '2026-08-01', sort_by: 'priority' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('DecideModerationCaseDto', () => {
  it('chấp nhận decision đơn lẻ (approve), không kèm target_status/reason', async () => {
    const errors = await validateDecide({ decision: 'approve' });
    expect(errors).toHaveLength(0);
  });

  it('chấp nhận đủ 3 trường (restore + target_status + reason)', async () => {
    const errors = await validateDecide({ decision: 'restore', target_status: 'published', reason: 'oan sai' });
    expect(errors).toHaveLength(0);
  });

  it('chấp nhận decision=dismiss (case-level, không đổi trạng thái nội dung)', async () => {
    const errors = await validateDecide({ decision: 'dismiss' });
    expect(errors).toHaveLength(0);
  });

  it('thiếu decision -> lỗi (bắt buộc)', async () => {
    const errors = await validateDecide({});
    expect(errors.some((e) => e.property === 'decision')).toBe(true);
  });

  it('từ chối decision không thuộc moderation_decision', async () => {
    const errors = await validateDecide({ decision: 'delete' });
    expect(errors.some((e) => e.property === 'decision')).toBe(true);
  });

  it('từ chối target_status không thuộc media_status (DTO chỉ xác nhận LÀ một media_status thật — FSM tự thu hẹp còn published/pending)', async () => {
    const errors = await validateDecide({ decision: 'restore', target_status: 'archived' });
    expect(errors.some((e) => e.property === 'target_status')).toBe(true);
  });

  it('chấp nhận target_status=hidden/rejected Ở TẦNG DTO (FSM mới là nơi từ chối, tránh trùng logic transition)', async () => {
    const errors = await validateDecide({ decision: 'restore', target_status: 'hidden' });
    expect(errors).toHaveLength(0);
  });

  it('reason được trim khoảng trắng', async () => {
    const dto = plainToInstance(DecideModerationCaseDto, { decision: 'hide', reason: '  spam quảng cáo  ' });
    expect(dto.reason).toBe('spam quảng cáo');
  });

  it('từ chối trường không thuộc hợp đồng', async () => {
    const errors = await validateDecide({ decision: 'approve', status: 'resolved' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
