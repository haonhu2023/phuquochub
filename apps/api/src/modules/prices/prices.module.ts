import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceHistory } from './entities/price-history.entity';
import { PricesRepository } from './repositories/prices.repository';
import { PricesService } from './prices.service';
import { PricesController } from './prices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PriceHistory])],
  controllers: [PricesController],
  providers: [PricesRepository, PricesService],
  exports: [PricesRepository],
})
export class PricesModule {}
