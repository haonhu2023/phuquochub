import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { VerificationVote } from '../entities/verification-vote.entity';
import { VerificationVoteChoice } from '../verification.enums';

export interface CastVote {
  verificationId: string;
  userId: string;
  vote: VerificationVoteChoice;
  weight: number;
  note?: string | null;
}

export interface VoteTally {
  confirmCount: number;
  disputeCount: number;
}

// Repository `verification_votes` (verification.md §5B) — sổ phiếu, MỘT người MỘT phiếu (đổi phiếu
// = UPDATE dòng hiện có qua `ON CONFLICT (verification_id,user_id) DO UPDATE`, idempotent — không
// nhân đôi khi gọi lại, §5C).
@Injectable()
export class VerificationVotesRepository {
  constructor(
    @InjectRepository(VerificationVote)
    private readonly repo: Repository<VerificationVote>,
  ) {}

  /** Upsert — tạo phiếu mới HOẶC đổi phiếu đã có (cùng user, cùng verification). */
  async cast(data: CastVote, manager?: EntityManager): Promise<VerificationVote> {
    const repo = manager ? manager.getRepository(VerificationVote) : this.repo;
    await repo.query(
      `INSERT INTO "verification_votes" ("verification_id","user_id","vote","weight","note")
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("verification_id","user_id")
       DO UPDATE SET "vote" = EXCLUDED."vote", "weight" = EXCLUDED."weight", "note" = EXCLUDED."note"`,
      [data.verificationId, data.userId, data.vote, data.weight, data.note ?? null],
    );
    const saved = await repo.findOne({ where: { verificationId: data.verificationId, userId: data.userId } });
    if (!saved) {
      throw new Error('Upsert verification_votes thất bại — không tìm lại được dòng vừa ghi.');
    }
    return saved;
  }

  /** Tính lại `confirm_count`/`dispute_count` = Σ weight theo loại phiếu — sổ phiếu là NGUỒN SỰ THẬT. */
  async tally(verificationId: string, manager?: EntityManager): Promise<VoteTally> {
    const repo = manager ? manager.getRepository(VerificationVote) : this.repo;
    const rows: Array<{ vote: VerificationVoteChoice; total: string }> = await repo
      .createQueryBuilder('vv')
      .select('vv.vote', 'vote')
      .addSelect('SUM(vv.weight)', 'total')
      .where('vv.verification_id = :verificationId', { verificationId })
      .groupBy('vv.vote')
      .getRawMany();

    let confirmCount = 0;
    let disputeCount = 0;
    for (const row of rows) {
      if (row.vote === VerificationVoteChoice.CONFIRM) {
        confirmCount = Number(row.total);
      } else if (row.vote === VerificationVoteChoice.DISPUTE) {
        disputeCount = Number(row.total);
      }
    }
    return { confirmCount, disputeCount };
  }
}
