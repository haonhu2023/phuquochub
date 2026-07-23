import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsRepository } from './repositories/events.repository';

// Event (Wave 2, ADR-002 PEER). Không phụ thuộc PlacesModule; dùng DataSource (raw SQL).
@Module({
  controllers: [EventsController],
  providers: [EventsRepository, EventsService],
})
export class EventsModule {}
