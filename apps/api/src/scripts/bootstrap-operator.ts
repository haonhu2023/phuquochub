import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import {
  BOOTSTRAPPABLE_ROLE_CODES,
  DEFAULT_BOOTSTRAP_ROLE,
  OperatorBootstrapError,
  OperatorBootstrapService,
} from '../modules/users/operator-bootstrap.service';

// OPERATOR BOOTSTRAP (2026-08-12) — cấp vai trò đặc quyền ĐẦU TIÊN trên một CSDL mới, phá thế bí
// RBAC mô tả ở `OperatorBootstrapService`. Cùng khuôn `clean-orphan-media.ts` /
// `expire-overdue-verifications.ts`: `NestFactory.createApplicationContext()` (KHÔNG mở HTTP
// server, KHÔNG đăng ký cron), lấy service qua DI, đóng app trong `finally`.
//
// Danh tính người vận hành đến từ BIẾN MÔI TRƯỜNG, không phải tham số dòng lệnh: đối số CLI nằm
// trong `ps`/shell history của cả máy, biến môi trường thì không. Script KHÔNG nhận và KHÔNG BAO
// GIỜ cần mật khẩu — tài khoản phải được đăng ký trước qua luồng auth bình thường.
//
// Usage:
//   BOOTSTRAP_OPERATOR_EMAIL=nguoi-van-hanh@example.com npm run operator:bootstrap
//   BOOTSTRAP_OPERATOR_EMAIL=bien-tap@example.com BOOTSTRAP_OPERATOR_ROLE=contributor \
//     npm run operator:bootstrap
//
// Chạy lại an toàn (idempotent). Thoát 1 kèm thông điệp rõ ràng nếu người dùng/vai trò không tồn
// tại hoặc vai trò không được phép bootstrap.
async function main(): Promise<void> {
  const email = process.env.BOOTSTRAP_OPERATOR_EMAIL ?? '';
  const roleCode = process.env.BOOTSTRAP_OPERATOR_ROLE ?? DEFAULT_BOOTSTRAP_ROLE;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const logger = new Logger('OperatorBootstrap');

  try {
    const service = app.get(OperatorBootstrapService);
    const result = await service.bootstrap({ email, roleCode });

    logger.log('--- Operator Bootstrap ---');
    // Email được in lại có chủ đích: người vận hành cần XÁC NHẬN mình vừa nâng quyền đúng tài
    // khoản. Không có bí mật nào ở đây — không mật khẩu, không token, không hash.
    logger.log(`email:   ${result.email}`);
    logger.log(`userId:  ${result.userId}`);
    logger.log(`role:    ${result.roleCode}`);
    logger.log(`outcome: ${result.outcome}`);

    if (result.outcome === 'already_assigned') {
      logger.log('Không có thay đổi nào — vai trò đã được cấp từ trước.');
    } else {
      logger.log(
        'Đã cấp vai trò. Người dùng cần ĐĂNG XUẤT rồi ĐĂNG NHẬP LẠI để phiên mới phản ánh quyền.',
      );
    }
  } catch (err) {
    if (err instanceof OperatorBootstrapError) {
      // Lỗi nghiệp vụ đã lường trước (thiếu email, sai vai trò, không thấy người dùng) — in đúng
      // thông điệp hướng dẫn, KHÔNG in stack trace: người chạy lệnh này là người vận hành đang làm
      // theo runbook, không phải lập trình viên đang gỡ lỗi.
      logger.error(err.message);
      logger.error(
        `Vai trò hợp lệ: ${BOOTSTRAPPABLE_ROLE_CODES.join(', ')} (mặc định: ${DEFAULT_BOOTSTRAP_ROLE}).`,
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  new Logger('OperatorBootstrap').error(
    `Bootstrap thất bại: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
});
