import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { DataQualityAuditService } from '../modules/admin-data/data-quality-audit.service';
import type { AuditReport, IssuePriority } from '../modules/admin-data/data-quality-audit.types';

// DATA QUALITY AUDIT — CLI runner (2026-08-20). Cùng khuôn `expire-overdue-verifications.ts`/
// `backfill-administrative-data.ts`: `NestFactory.createApplicationContext()` (không mở HTTP,
// không đăng ký cron), lấy service qua DI, đóng app trong `finally`.
//
// KHÁC HAI SCRIPT KIA Ở MỘT ĐIỂM: audit này KHÔNG GHI BẤT KỲ BẢNG NÀO (xem class doc
// DataQualityAuditService) — vẫn giữ `assertNotProduction()` vì lý do khác: Section 0 của brief
// cấm "truy cập trực tiếp production database" như một quy tắc CỨNG, không phân biệt đọc/ghi. Một
// script chạy local không có lý do chính đáng nào để trỏ vào production, kể cả chỉ để đọc.
//
// Usage:
//   npm run audit:data-quality
//   npm run audit:data-quality -- --slugs=bai-sao,dinh-cau   (audit một tập con, vd để test nhanh)
//
// Output: apps/api/reports/data-quality/<audit_run_id>.json và .md (git-ignored — xem .gitignore;
// đây là ĐẦU RA CÓ THỂ THAY ĐỔI MỖI LẦN CHẠY khi dữ liệu thật thay đổi, không phải một snapshot
// nên commit theo mã nguồn).
export interface ProductionSafetyCheck {
  isSafe: boolean;
  reasons: string[];
}

export function assertNotProduction(env: NodeJS.ProcessEnv = process.env): ProductionSafetyCheck {
  const reasons: string[] = [];
  if (env.NODE_ENV === 'production') {
    reasons.push(`NODE_ENV=production`);
  }
  const suspects: Array<[string, string | undefined]> = [
    ['DATABASE_URL', env.DATABASE_URL],
    ['DB_HOST', env.DB_HOST],
    ['DB_NAME', env.DB_NAME],
  ];
  for (const [key, value] of suspects) {
    if (value && /prod/i.test(value)) {
      reasons.push(`${key} chứa chuỗi "prod": ${value}`);
    }
  }
  return { isSafe: reasons.length === 0, reasons };
}

function parseSlugsArg(argv: string[]): string[] | undefined {
  const arg = argv.find((a) => a.startsWith('--slugs='));
  if (!arg) return undefined;
  return arg
    .slice('--slugs='.length)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function priorityCount(report: AuditReport, priority: IssuePriority): number {
  return report.summary.issues_by_priority[priority];
}

/** Markdown gọn — số liệu + top issue mỗi priority. Chi tiết đầy đủ nằm ở file JSON song song. */
function renderMarkdown(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`# Data Quality Audit — ${report.audit_run_id}`);
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Dataset: ${report.dataset_version}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(
    `- P0: ${priorityCount(report, 'P0')} · P1: ${priorityCount(report, 'P1')} · P2: ${priorityCount(report, 'P2')}`,
  );
  lines.push(
    `- Average scores — completeness: ${report.summary.average_scores.completeness}, trust: ${report.summary.average_scores.trust}, freshness: ${report.summary.average_scores.freshness}, overall: ${report.summary.average_scores.overall}`,
  );
  lines.push('');
  lines.push('## Field coverage');
  lines.push('');
  lines.push('| Field | Filled | Empty | N/A | Coverage (of applicable) |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const row of report.field_coverage) {
    // N/A: place mà trường KHÔNG áp dụng được (vd phone với bãi biển công cộng không có đơn vị vận
    // hành). KHÔNG nằm trong `Empty`, KHÔNG nằm trong mẫu số của `Coverage`.
    lines.push(
      `| ${row.field} | ${row.filled} | ${row.empty} | ${row.not_applicable} | ${row.coverage_pct}% |`,
    );
  }
  lines.push('');
  lines.push('## Administrative notes');
  lines.push('');
  for (const note of report.administrative_notes) {
    lines.push(`- ${note}`);
  }
  lines.push('');

  for (const priority of ['P0', 'P1', 'P2'] as const) {
    const items = report.issues.filter((i) => i.priority === priority);
    if (items.length === 0) continue;
    lines.push(`## ${priority} issues (${items.length})`);
    lines.push('');
    for (const issue of items) {
      lines.push(`### ${issue.place_name} (${issue.place_slug})`);
      lines.push(`- **Type:** ${issue.issue_type}`);
      lines.push(`- **Field:** ${issue.field ?? '(place-level)'}`);
      lines.push(`- **Current value:** ${issue.current_value ?? 'NULL'}`);
      lines.push(`- **Reason:** ${issue.reason}`);
      lines.push(`- **Confidence:** ${issue.confidence}`);
      if (issue.evidence) lines.push(`- **Evidence:** ${issue.evidence}`);
      lines.push(`- **Status:** ${issue.status}`);
      lines.push('');
    }
  }

  lines.push('## Places');
  lines.push('');
  lines.push('| Slug | Name | Verification | Completeness | Trust | Freshness | Overall |');
  lines.push('|---|---|---|---:|---:|---:|---:|');
  for (const p of report.places) {
    lines.push(
      `| ${p.slug} | ${p.name} | ${p.verification_status} | ${p.scores.completeness} | ${p.scores.trust} | ${p.scores.freshness} | ${p.scores.overall} |`,
    );
  }
  lines.push('');

  return lines.join('\n');
}

async function main(): Promise<void> {
  const logger = new Logger('DataQualityAuditRunner');

  const safety = assertNotProduction();
  if (!safety.isSafe) {
    logger.error('ABORT — môi trường có dấu hiệu production, script từ chối chạy:');
    for (const reason of safety.reasons) {
      logger.error(`  - ${reason}`);
    }
    logger.error('Không có cờ bỏ qua kiểm tra này. Chạy trên local/rehearsal DB, không phải production.');
    process.exitCode = 1;
    return;
  }

  const slugs = parseSlugsArg(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const service = app.get(DataQualityAuditService);
    logger.log(`Starting data quality audit${slugs ? ` (${slugs.length} slug override)` : ' (49 official slugs)'}...`);

    const report = await service.audit(slugs);

    logger.log('--- Data Quality Audit Summary ---');
    logger.log(`places audited:    ${report.summary.total_places}`);
    logger.log(`issues P0/P1/P2:   ${priorityCount(report, 'P0')}/${priorityCount(report, 'P1')}/${priorityCount(report, 'P2')}`);
    logger.log(
      `avg completeness/trust/freshness/overall: ${report.summary.average_scores.completeness}/${report.summary.average_scores.trust}/${report.summary.average_scores.freshness}/${report.summary.average_scores.overall}`,
    );

    const outDir = join(__dirname, '..', '..', 'reports', 'data-quality');
    mkdirSync(outDir, { recursive: true });
    const jsonPath = join(outDir, `${report.audit_run_id}.json`);
    const mdPath = join(outDir, `${report.audit_run_id}.md`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    writeFileSync(mdPath, renderMarkdown(report), 'utf8');
    logger.log(`Written: ${jsonPath}`);
    logger.log(`Written: ${mdPath}`);
  } finally {
    await app.close();
  }
}

// `require.main === module` — cùng lý do các script khác: chỉ chạy `main()` khi file này được
// thực thi TRỰC TIẾP, không khi bị `import` bởi test.
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console -- app context/logger đã đóng ở nhánh này
    console.error('Data quality audit failed:', err);
    process.exit(1);
  });
}
