import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaceEditSuggestion, PlaceSuggestionStatus } from './entities/place-edit-suggestion.entity';

@Injectable()
export class PlaceSuggestionsRepository {
  constructor(
    @InjectRepository(PlaceEditSuggestion)
    private readonly repo: Repository<PlaceEditSuggestion>,
  ) {}

  create(data: Partial<PlaceEditSuggestion>): PlaceEditSuggestion {
    return this.repo.create(data);
  }

  save(item: PlaceEditSuggestion): Promise<PlaceEditSuggestion> {
    return this.repo.save(item);
  }

  findById(id: string): Promise<PlaceEditSuggestion | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByPlace(placeId: string, status?: PlaceSuggestionStatus): Promise<PlaceEditSuggestion[]> {
    return this.repo.find({
      where: status ? { placeId, status } : { placeId },
      order: { createdAt: 'DESC' },
    });
  }

  findAll(status?: PlaceSuggestionStatus, limit = 50, offset = 0): Promise<PlaceEditSuggestion[]> {
    return this.repo.find({
      where: status ? { status } : undefined,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }
}
