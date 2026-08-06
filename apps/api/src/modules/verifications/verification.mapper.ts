import { Verification } from './entities/verification.entity';
import { VerificationEvent } from './entities/verification-event.entity';

export interface VerificationResponse {
  id: string;
  place_id: string | null;
  contact_id: string | null;
  price_history_id: string | null;
  status: string;
  method: string;
  source_id: string | null;
  confidence: number | null;
  confirm_count: number;
  dispute_count: number;
  reason_code: string | null;
  verified_by: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  sla_due_at: string | null;
  priority: number;
  note: string | null;
  rejected_reason: string | null;
  valid_from: string | null;
  expires_at: string | null;
  lock_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function toVerificationResponse(v: Verification): VerificationResponse {
  return {
    id: v.id,
    place_id: v.placeId,
    contact_id: v.contactId,
    price_history_id: v.priceHistoryId,
    status: v.status,
    method: v.method,
    source_id: v.sourceId,
    confidence: v.confidence,
    confirm_count: v.confirmCount,
    dispute_count: v.disputeCount,
    reason_code: v.reasonCode,
    verified_by: v.verifiedBy,
    assigned_to: v.assignedTo,
    assigned_at: v.assignedAt ? v.assignedAt.toISOString() : null,
    sla_due_at: v.slaDueAt ? v.slaDueAt.toISOString() : null,
    priority: v.priority,
    note: v.note,
    rejected_reason: v.rejectedReason,
    valid_from: v.validFrom ? v.validFrom.toISOString() : null,
    expires_at: v.expiresAt ? v.expiresAt.toISOString() : null,
    lock_version: v.lockVersion,
    created_by: v.createdBy,
    created_at: v.createdAt.toISOString(),
    updated_at: v.updatedAt.toISOString(),
  };
}

export interface VerificationEventResponse {
  id: string;
  verification_id: string;
  from_status: string | null;
  to_status: string;
  method: string;
  source_id: string | null;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}

export function toVerificationEventResponse(e: VerificationEvent): VerificationEventResponse {
  return {
    id: e.id,
    verification_id: e.verificationId,
    from_status: e.fromStatus,
    to_status: e.toStatus,
    method: e.method,
    source_id: e.sourceId,
    actor_id: e.actorId,
    note: e.note,
    created_at: e.createdAt.toISOString(),
  };
}
