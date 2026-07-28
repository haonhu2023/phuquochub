import { Module } from '@nestjs/common';
import { AttractionsController } from './attractions.controller';
import { AttractionsService } from './attractions.service';
import { AttractionsRepository } from './repositories/attractions.repository';

// Attraction = Place (category='attraction'), KHÔNG có bảng vệ tinh ⇒ không cần PlacesModule:
// module này chỉ đọc `places`/`categories` qua DataSource, không tạo Place nào.
@Module({
  controllers: [AttractionsController],
  providers: [AttractionsRepository, AttractionsService],
})
export class AttractionsModule {}
