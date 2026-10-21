import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ListingReport } from '../entities/listing-report.entity';
import { ListableTargetType } from '../../../common/listable-target-type.enum';
import { ListingReportStatus } from '../listing-reports.enums';

@Injectable()
export class ListingReportsRepository {
  constructor(@InjectRepository(ListingReport) private readonly repo: Repository<ListingReport>) {}

  create(data: Partial<ListingReport>): Promise<ListingReport> {
    return this.repo.save(this.repo.create(data));
  }

  findById(id: string): Promise<ListingReport | null> {
    return this.repo.findOne({ where: { id } });
  }

  save(entity: ListingReport): Promise<ListingReport> {
    return this.repo.save(entity);
  }

  // Hàng chờ cho MỘT loại target cụ thể — service gọi riêng cho từng loại caller có quyền
  // (xem ListingReportsService's comment), không có một truy vấn "tất cả loại" chung.
  listOpenByTargetType(targetType: ListableTargetType): Promise<ListingReport[]> {
    return this.repo.find({
      where: { targetType, status: ListingReportStatus.OPEN },
      order: { createdAt: 'ASC' },
    });
  }

  // Giai đoạn 2 (21/10/2026) — báo cáo đang mở cho ĐÚNG tập id tin của MỘT người đăng cụ thể
  // (service tự suy tập id này từ listMine() của job/real-estate, không tin id client gửi — xem
  // ListingReportsService.listMineOpen()'s comment). targetIds rỗng → trả mảng rỗng, không query.
  listOpenByTargetTypeAndIds(targetType: ListableTargetType, targetIds: string[]): Promise<ListingReport[]> {
    if (targetIds.length === 0) return Promise.resolve([]);
    return this.repo.find({
      where: { targetType, targetId: In(targetIds), status: ListingReportStatus.OPEN },
      order: { createdAt: 'ASC' },
    });
  }
}
