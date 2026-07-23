import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditResult } from './audit.enums';

export interface AuditInsert {
  event: string;
  actorId: string | null;
  actorRole: string | null;
  isServiceAccount: boolean;
  permission: string | null;
  scope: string | null;
  entityType: string;
  entityId: string | null;
  result: AuditResult;
  ip: string | null;
  userAgent: string | null;
  before: unknown;
  after: unknown;
  context: unknown;
  correlationId: string | null;
}

// Ghi `audit_logs` — APPEND-ONLY (ADR-016: chỉ INSERT, cấm UPDATE/DELETE). Tham số hóa.
@Injectable()
export class AuditRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async insert(r: AuditInsert): Promise<void> {
    await this.ds.query(
      `INSERT INTO "audit_logs"
         ("event","actor_id","actor_role","is_service_account","permission","scope",
          "entity_type","entity_id","result","ip","user_agent","before","after","context","correlation_id")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        r.event,
        r.actorId,
        r.actorRole,
        r.isServiceAccount,
        r.permission,
        r.scope,
        r.entityType,
        r.entityId,
        r.result,
        r.ip,
        r.userAgent,
        r.before == null ? null : JSON.stringify(r.before),
        r.after == null ? null : JSON.stringify(r.after),
        r.context == null ? null : JSON.stringify(r.context),
        r.correlationId,
      ],
    );
  }
}
