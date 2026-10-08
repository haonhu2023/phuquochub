import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
}
