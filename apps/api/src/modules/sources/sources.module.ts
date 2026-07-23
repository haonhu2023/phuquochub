import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Source } from './entities/source.entity';
import { SourceAttribution } from './entities/source-attribution.entity';
import { SourcesRepository } from './repositories/sources.repository';
import { SourceAttributionsRepository } from './repositories/source-attributions.repository';
import { SourcesService } from './sources.service';
import { SourcesController } from './sources.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Source, SourceAttribution])],
  controllers: [SourcesController],
  providers: [SourcesRepository, SourceAttributionsRepository, SourcesService],
  exports: [SourcesRepository, SourceAttributionsRepository, SourcesService],
})
export class SourcesModule {}
