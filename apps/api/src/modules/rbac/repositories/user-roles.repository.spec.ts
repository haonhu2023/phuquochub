import { Repository } from 'typeorm';
import { UserRolesRepository } from './user-roles.repository';
import { UserRole } from '../entities/user-role.entity';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('UserRolesRepository', () => {
  let repo: LooseMock<Repository<UserRole>>;
  let sut: UserRolesRepository;

  beforeEach(() => {
    repo = createMock<Repository<UserRole>>({ query: jest.fn() });
    sut = new UserRolesRepository(repo);
  });

  describe('getScopedGrants (ADR-019 D12 — recursive CTE)', () => {
    it('gọi ĐÚNG MỘT truy vấn, tham số hoá đúng userId', async () => {
      repo.query.mockResolvedValue([]);
      await sut.getScopedGrants('u1');

      expect(repo.query).toHaveBeenCalledTimes(1);
      const [sql, params] = repo.query.mock.calls[0];
      expect(params).toEqual(['u1']);
      expect(sql).toContain('WITH RECURSIVE');
      expect(sql).toContain('WHERE user_id = $1 AND revoked_at IS NULL');
      expect(sql).toContain('UNION\n');
      expect(sql).not.toContain('UNION ALL');
      expect(sql).toContain('JOIN role_parents rp ON rp.role_id = e.role_id');
      expect(sql).toContain('JOIN role_permissions rperm ON rperm.role_id = e.role_id');
      expect(sql).toContain('JOIN permissions      p     ON p.id = rperm.permission_id');
    });

    it('grant TRỰC TIẾP (không kế thừa) — map đúng code/effect/scopeType/businessId', async () => {
      repo.query.mockResolvedValue([
        { user_role_id: 'ur1', scope_type: 'managed', business_id: 'place-A', code: 'Place.Edit.Managed', effect: 'allow' },
      ]);

      const grants = await sut.getScopedGrants('u1');

      expect(grants).toEqual([
        { code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'place-A' },
      ]);
    });

    it('grant KẾ THỪA qua DAG vẫn giữ scope_type/business_id của DÒNG user_roles GỐC', async () => {
      // vd business_owner (dòng gốc, business_id=place-A) kế thừa Place.Edit.Managed từ business_manager —
      // dòng trả về mang business_id=place-A dù permission thuộc về role tổ tiên, không phải role gốc.
      repo.query.mockResolvedValue([
        { user_role_id: 'ur1', scope_type: 'managed', business_id: 'place-A', code: 'Place.Edit.Managed', effect: 'allow' },
      ]);

      const grants = await sut.getScopedGrants('u1');

      expect(grants[0].businessId).toBe('place-A');
    });

    it('NHIỀU dòng user_roles gốc khác business_id giữ RIÊNG BIỆT, không trộn lẫn', async () => {
      repo.query.mockResolvedValue([
        { user_role_id: 'ur1', scope_type: 'managed', business_id: 'place-A', code: 'Place.Edit.Managed', effect: 'allow' },
        { user_role_id: 'ur2', scope_type: 'managed', business_id: 'place-B', code: 'Place.Edit.Managed', effect: 'allow' },
      ]);

      const grants = await sut.getScopedGrants('u1');

      expect(grants).toHaveLength(2);
      expect(grants.map((g) => g.businessId).sort()).toEqual(['place-A', 'place-B']);
    });

    it('DAG hình thoi: nhiều dòng thô (từ nhiều user_role_id/đường đi) trùng scope+code+effect -> khử trùng còn 1', async () => {
      // Mô phỏng kết quả thô một CTE thật có thể trả cho DAG hình thoi (vd moderator -> {contributor,
      // local_guide} -> member): permission của 'member' xuất hiện 2 lần thô (một cho mỗi đường DAG)
      // nhưng CÙNG scope_type/business_id/code/effect (vì cùng một dòng seed gốc) -> phải còn 1.
      repo.query.mockResolvedValue([
        { user_role_id: 'ur1', scope_type: 'global', business_id: null, code: 'Business.Claim', effect: 'allow' },
        { user_role_id: 'ur1', scope_type: 'global', business_id: null, code: 'Business.Claim', effect: 'allow' },
      ]);

      const grants = await sut.getScopedGrants('u1');

      expect(grants).toHaveLength(1);
      expect(grants[0]).toEqual({ code: 'Business.Claim', effect: 'allow', scopeType: 'global', businessId: null });
    });

    it('allow VÀ deny trên cùng mã permission đều được giữ (không bị khử trùng lẫn nhau)', async () => {
      repo.query.mockResolvedValue([
        { user_role_id: 'ur1', scope_type: 'global', business_id: null, code: 'Category.Manage', effect: 'allow' },
        { user_role_id: 'ur2', scope_type: 'global', business_id: null, code: 'Category.Manage', effect: 'deny' },
      ]);

      const grants = await sut.getScopedGrants('u1');

      expect(grants).toHaveLength(2);
      expect(grants.some((g) => g.effect === 'allow')).toBe(true);
      expect(grants.some((g) => g.effect === 'deny')).toBe(true);
    });

    it('wildcard (`*`) và mã có hậu tố scope đều giữ NGUYÊN VĂN, không bị diễn giải lại', async () => {
      repo.query.mockResolvedValue([
        { user_role_id: 'ur1', scope_type: 'global', business_id: null, code: '*', effect: 'allow' },
        { user_role_id: 'ur1', scope_type: 'managed', business_id: 'place-A', code: 'Place.Edit.Managed', effect: 'allow' },
      ]);

      const grants = await sut.getScopedGrants('u1');

      expect(grants.map((g) => g.code).sort()).toEqual(['*', 'Place.Edit.Managed']);
    });

    it('không có user_roles hiệu lực nào -> mảng rỗng, vẫn gọi query đúng một lần', async () => {
      repo.query.mockResolvedValue([]);
      await expect(sut.getScopedGrants('u1')).resolves.toEqual([]);
      expect(repo.query).toHaveBeenCalledTimes(1);
    });
  });
});
