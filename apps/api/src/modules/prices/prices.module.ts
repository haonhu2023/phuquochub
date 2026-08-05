import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceHistory } from './entities/price-history.entity';
import { PricesRepository } from './repositories/prices.repository';
import { PricesService } from './prices.service';
import { PricesController } from './prices.controller';
import { PRICE_AUTHZ_RESOLVER, PriceAuthzResolver } from './resolvers/price-authz.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([PriceHistory])],
  controllers: [PricesController],
  providers: [
    PricesRepository,
    PricesService,
    { provide: PRICE_AUTHZ_RESOLVER, useClass: PriceAuthzResolver },
  ],
  exports: [PricesRepository, PRICE_AUTHZ_RESOLVER],
})
export class PricesModule {}
