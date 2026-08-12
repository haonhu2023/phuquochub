import { Injectable, Logger } from '@nestjs/common';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { UsersRepository } from './repositories/users.repository';
import { ScopeType } from '../rbac/rbac.enums';
import { AuditService } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';

/**
 * Vai trò được phép bootstrap — ALLOWLIST TƯỜNG MINH, không phải "bất kỳ vai trò nào có trong
 * bảng". Hai lý do:
 *
 *  • `super_administrator` giữ permission `*` (wildcard tuyệt đối, SeedRbac) — không bao giờ được
 *    cấp bởi một lệnh chạy từ shell với một biến môi trường. Nếu thật sự cần, một
 *    `administrator` đã bootstrap sẽ cấp nó QUA ỨNG DỤNG (`POST /users/{id}/roles`, có audit,
 *    có người chịu trách nhiệm), không phải qua script.
 *  • gõ nhầm tên vai trò phải là lỗi dừng hẳn, không phải một lần cấp quyền im lặng.
 *
 * `administrator` là MẶC ĐỊNH vì đó là vai trò ĐẶC QUYỀN NHỎ NHẤT phá được thế bí bootstrap: nó
 * giữ `Role.Assign` (tự cấp tiếp cho đồng đội qua API, không cần script lần hai) và kế thừa
 * `moderator` → `contributor` (duyệt kiểm duyệt + toàn bộ năng lực biên tập). `contributor` được
 * cho phép để bootstrap NGƯỜI BIÊN TẬP THUẦN — biên tập nội dung, KHÔNG duyệt kiểm duyệt, KHÔNG
 * cấp vai trò; đây chính là tài khoản thứ hai mà quy trình hai-người ở §Media cần.
 */
export const BOOTSTRAPPABLE_ROLE_CODES = ['administrator', 'moderator', 'contributor'] as const;
export type BootstrappableRoleCode = (typeof BOOTSTRAPPABLE_ROLE_CODES)[number];

export const DEFAULT_BOOTSTRAP_ROLE: BootstrappableRoleCode = 'administrator';

export interface BootstrapOperatorParams {
  email: string;
  roleCode?: string;
}

export interface BootstrapOperatorResult {
  userId: string;
  email: string;
  roleCode: string;
  /** `granted` = vừa cấp lần này; `already_assigned` = đã có sẵn, không ghi gì thêm. */
  outcome: 'granted' | 'already_assigned';
}

export class OperatorBootstrapError extends Error {}

/**
 * Bootstrap NGƯỜI VẬN HÀNH ĐẦU TIÊN — lối thoát cho thế bí RBAC trên một CSDL production mới tinh
 * (Operator Bootstrap & Editorial Place Content, 2026-08-12).
 *
 * THẾ BÍ: `SeedRbac` tạo 10 vai trò nhưng KHÔNG tạo dòng `user_roles` nào; endpoint cấp vai trò duy
 * nhất (`POST /users/{id}/roles`) đòi `Role.Assign` — chỉ `administrator`/`super_administrator` có.
 * Trên CSDL mới, mọi người dùng đăng ký đều là `member`, nên KHÔNG AI cấp được vai trò cho ai. Hệ
 * quả dây chuyền: không ai duyệt được claim, không ai kiểm duyệt được ảnh, mọi ảnh chủ cơ sở tải
 * lên nằm `pending` vĩnh viễn.
 *
 * NGUYÊN TẮC AN TOÀN của lối thoát này:
 *  • KHÔNG tạo người dùng. Người vận hành phải TỰ ĐĂNG KÝ qua luồng auth bình thường trước — nghĩa
 *    là mật khẩu do chính họ đặt, script không bao giờ thấy/nhận/đặt mật khẩu, và không tồn tại
 *    "tài khoản admin mặc định" với mật khẩu biết trước.
 *  • KHÔNG tự động thăng cấp ai lúc đăng ký. Chỉ nâng ĐÚNG một email được chỉ định tường minh.
 *  • Idempotent: chạy lại không tạo dòng `user_roles` thứ hai và không ghi audit lần hai.
 *  • Dừng rõ ràng khi người dùng/vai trò không tồn tại — không im lặng tạo mới.
 *  • Ghi audit (`role.assigned`) đúng như đường API, để một lần cấp quyền từ shell không bao giờ là
 *    một sự kiện vô hình.
 */
@Injectable()
export class OperatorBootstrapService {
  private readonly logger = new Logger(OperatorBootstrapService.name);

  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly rolesRepo: RolesRepository,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly audit: AuditService,
  ) {}

  async bootstrap(params: BootstrapOperatorParams): Promise<BootstrapOperatorResult> {
    const email = params.email?.trim().toLowerCase() ?? '';
    if (!email) {
      throw new OperatorBootstrapError(
        'Thiếu email người vận hành. Đặt BOOTSTRAP_OPERATOR_EMAIL trước khi chạy lệnh này.',
      );
    }

    const roleCode = (params.roleCode?.trim() || DEFAULT_BOOTSTRAP_ROLE) as string;
    if (!(BOOTSTRAPPABLE_ROLE_CODES as readonly string[]).includes(roleCode)) {
      throw new OperatorBootstrapError(
        `Vai trò "${roleCode}" không nằm trong danh sách được phép bootstrap ` +
          `(${BOOTSTRAPPABLE_ROLE_CODES.join(', ')}). ` +
          'super_administrator CỐ Ý không có ở đây — cấp nó qua ứng dụng bằng một administrator đã có.',
      );
    }

    // Người dùng phải TỒN TẠI TRƯỚC. Không tạo hộ: tạo hộ đồng nghĩa với việc script phải đặt một
    // mật khẩu nào đó, và mọi mật khẩu do script đặt đều là thông tin đăng nhập mặc định.
    const user = await this.usersRepo.findByEmail(email);
    if (!user) {
      throw new OperatorBootstrapError(
        `Không tìm thấy người dùng với email "${email}". ` +
          'Hãy đăng ký tài khoản đó qua luồng đăng ký bình thường TRƯỚC, rồi chạy lại lệnh này.',
      );
    }

    const role = await this.rolesRepo.findByCode(roleCode);
    if (!role) {
      throw new OperatorBootstrapError(
        `Không tìm thấy vai trò "${roleCode}" — migration SeedRbac đã chạy chưa?`,
      );
    }

    // Idempotent: vai trò global (business_id NULL) đã cấp và chưa thu hồi thì DỪNG ở đây — không
    // tạo dòng thứ hai, không ghi audit lần hai. Chạy lại lệnh là chuyện bình thường trong một
    // runbook (thử lại sau lỗi mạng, chạy lại toàn bộ script triển khai), không phải lỗi.
    const existing = await this.userRolesRepo.findActive(user.id, role.id, null);
    if (existing) {
      this.logger.log(`Người dùng ${email} ĐÃ có vai trò "${roleCode}" — không thay đổi gì.`);
      return { userId: user.id, email, roleCode, outcome: 'already_assigned' };
    }

    await this.userRolesRepo.assign({
      userId: user.id,
      roleId: role.id,
      scopeType: ScopeType.GLOBAL,
      // Không có actor người dùng nào đứng sau lệnh chạy từ shell — `grantedBy` để NULL thay vì
      // mượn danh chính người được cấp (điều đó sẽ tạo một vết audit sai sự thật: "tự cấp cho
      // mình"). Dòng audit bên dưới ghi rõ nguồn là bootstrap script.
      grantedBy: null,
    });

    await this.audit.record({
      event: 'role.assigned',
      entityType: 'user',
      entityId: user.id,
      actorId: null,
      result: AuditResult.SUCCESS,
      after: { role: roleCode, scope_type: ScopeType.GLOBAL },
      context: { source: 'operator-bootstrap-script' },
    });

    this.logger.log(`Đã cấp vai trò "${roleCode}" cho ${email}.`);
    return { userId: user.id, email, roleCode, outcome: 'granted' };
  }
}
