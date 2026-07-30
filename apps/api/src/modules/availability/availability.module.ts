import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilitySlot } from './entities/availability-slot.entity';
import { InventoryHold } from './entities/inventory-hold.entity';
import { AvailabilitySlotsRepository } from './repositories/availability-slots.repository';
import { InventoryHoldsRepository } from './repositories/inventory-holds.repository';
import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';

// Exports InventoryHoldsRepository (không chỉ AvailabilityService) — BookingsRepository.create()
// cần gọi placeHold(manager, ...) TRỰC TIẾP để dùng chung transaction với việc tạo booking+items
// của chính nó (xem bookings.repository.ts và ghi chú tại InventoryHoldsRepository.placeHold).
@Module({
  imports: [TypeOrmModule.forFeature([AvailabilitySlot, InventoryHold])],
  controllers: [AvailabilityController],
  providers: [AvailabilitySlotsRepository, InventoryHoldsRepository, AvailabilityService],
  exports: [AvailabilitySlotsRepository, InventoryHoldsRepository, AvailabilityService],
})
export class AvailabilityModule {}
