import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogQueryDto } from './dto/audit-log.dto';
import { AuditResult } from '../../core/audit/audit.enums';

// Gap vá 22/10/2026 (rà soát vận hành toàn site, mục 3): trước bản này, `audit_logs` chỉ xem được
// qua 20 dòng gần nhất nhúng trong OwnerCommandCenter, không lọc/tìm/phân trang được — tra "ai đã
// đóng tin X tuần trước" chỉ làm được bằng SQL tay. Trang này CHỈ thêm lọc + phân trang trên CÙNG
// tập cột đã duyệt (xem audit-log.service.ts's SELECT_COLUMNS comment) — không mở rộng lộ dữ liệu.
describe('Audit log lookup page (gap phát hiện 22/10/2026)', () => {
  it('yêu cầu cùng quyền Ops.Dashboard.View với owner-dashboard — không phải permission riêng', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AuditLogController.prototype.list)).toEqual(['Ops.Dashboard.View']);
  });

  describe('ListAuditLogQueryDto', () => {
    it('mọi field đều optional — không filter nào vẫn hợp lệ', async () => {
      expect(await validate(plainToInstance(ListAuditLogQueryDto, {}))).toEqual([]);
    });

    it.each(['entity_id', 'actor_id'])('%s không phải UUID hợp lệ → reject', async (field) => {
      const errors = await validate(plainToInstance(ListAuditLogQueryDto, { [field]: 'not-a-uuid' }));
      expect(errors.some((e) => e.property === field)).toBe(true);
    });

    it('result không khớp AuditResult → reject', async () => {
      const errors = await validate(plainToInstance(ListAuditLogQueryDto, { result: 'bogus' }));
      expect(errors.some((e) => e.property === 'result')).toBe(true);
    });

    it('result đúng giá trị AuditResult → hợp lệ', async () => {
      expect(await validate(plainToInstance(ListAuditLogQueryDto, { result: AuditResult.DENY }))).toEqual([]);
    });

    it('from/to không phải ISO 8601 → reject', async () => {
      const errors = await validate(plainToInstance(ListAuditLogQueryDto, { from: '22/10/2026' }));
      expect(errors.some((e) => e.property === 'from')).toBe(true);
    });

    it('limit vượt quá 100 → reject (chặn quét toàn bảng qua API)', async () => {
      const errors = await validate(plainToInstance(ListAuditLogQueryDto, { limit: 101 }));
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });
  });

  describe('AuditLogService — xây WHERE động, tham số hóa', () => {
    function mockDs(items: unknown[] = [], total = 0) {
      const query = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(items))
        .mockImplementationOnce(() => Promise.resolve([{ total }]));
      return { ds: { query } as unknown as DataSource, query };
    }

    it('không filter nào → WHERE rỗng, chỉ LIMIT/OFFSET tham số', async () => {
      const { ds, query } = mockDs();
      await new AuditLogService(ds).list({}, 1, 20);

      const [sql, params] = query.mock.calls[0];
      expect(sql).not.toMatch(/WHERE/);
      expect(params).toEqual([20, 0]);
    });

    it('trang 3, limit 20 → OFFSET 40 (đúng công thức (page-1)*limit)', async () => {
      const { ds, query } = mockDs();
      await new AuditLogService(ds).list({}, 3, 20);
      expect(query.mock.calls[0][1]).toEqual([20, 40]);
    });

    it('lọc entity_type + entity_id → AND, đúng thứ tự tham số, tận dụng index (entity_type,entity_id,created_at)', async () => {
      const { ds, query } = mockDs();
      await new AuditLogService(ds).list({ entityType: 'job_listing', entityId: 'e1' }, 1, 20);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/WHERE entity_type = \$1 AND entity_id = \$2/);
      expect(params).toEqual(['job_listing', 'e1', 20, 0]);
    });

    it('lọc event → ILIKE với wildcard cả hai đầu (so khớp MỘT PHẦN, không tuyệt đối)', async () => {
      const { ds, query } = mockDs();
      await new AuditLogService(ds).list({ event: 'job_listing' }, 1, 20);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/event ILIKE \$1/);
      expect(params[0]).toBe('%job_listing%');
    });

    it('lọc result → cast ::audit_result tường minh', async () => {
      const { ds, query } = mockDs();
      await new AuditLogService(ds).list({ result: AuditResult.DENY }, 1, 20);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/result = \$1::audit_result/);
      expect(params[0]).toBe(AuditResult.DENY);
    });

    it('lọc from/to → khoảng ngày hai đầu bao gồm (>=/<=)', async () => {
      const { ds, query } = mockDs();
      await new AuditLogService(ds).list({ from: '2026-10-01', to: '2026-10-22' }, 1, 20);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/created_at >= \$1 AND created_at <= \$2/);
      expect(params).toEqual(['2026-10-01', '2026-10-22', 20, 0]);
    });

    it('kết hợp actor_id + event → cùng truy vấn đếm tổng dùng CHUNG điều kiện WHERE (không lệch trang/tổng)', async () => {
      const { ds, query } = mockDs([], 7);
      const result = await new AuditLogService(ds).list({ actorId: 'u1', event: 'closed' }, 1, 20);

      const [countSql, countParams] = query.mock.calls[1];
      expect(countSql).toMatch(/WHERE actor_id = \$1 AND event ILIKE \$2/);
      expect(countParams).toEqual(['u1', '%closed%']);
      expect(result.total).toBe(7);
    });

    it('projection KHÔNG bao giờ chọn ip/user_agent/before/after/context thô — giữ nguyên ranh giới đã chốt ở owner-dashboard', async () => {
      const { ds, query } = mockDs();
      await new AuditLogService(ds).list({}, 1, 20);

      const sql: string = query.mock.calls[0][0];
      expect(sql).not.toMatch(/\bip\b/);
      expect(sql).not.toMatch(/user_agent/);
      expect(sql).not.toMatch(/"context"/);
      expect(sql).toMatch(/correlation_id/);
    });

    it('total = 0 khi bảng đếm trả về rỗng (không throw, không undefined)', async () => {
      const query = jest.fn()
        .mockImplementationOnce(() => Promise.resolve([]))
        .mockImplementationOnce(() => Promise.resolve([]));
      const result = await new AuditLogService({ query } as unknown as DataSource).list({}, 1, 20);
      expect(result.total).toBe(0);
    });
  });
});
