import { Module } from '@nestjs/common';
import { BeachesController } from './beaches.controller';
import { BeachesService } from './beaches.service';
import { BeachesRepository } from './repositories/beaches.repository';

// Beach = Place (category='beach'), KHÔNG có bảng vệ tinh ⇒ không cần PlacesModule: module này
// chỉ đọc `places`/`categories` qua DataSource, không tạo Place nào.
@Module({
  controllers: [BeachesController],
  providers: [BeachesRepository, BeachesService],
})
export class BeachesModule {}
