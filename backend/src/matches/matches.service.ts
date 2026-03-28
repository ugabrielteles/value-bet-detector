import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchesRepository } from './infrastructure/repositories/matches.repository';
import { MatchEntity } from './domain/entities/match.entity';

@Injectable()
export class MatchesService {
  constructor(private readonly matchesRepository: MatchesRepository) {}

  async findAll(filters: { status?: string; league?: string } = {}): Promise<MatchEntity[]> {
    return this.matchesRepository.findAll(filters);
  }

  async findById(id: string): Promise<MatchEntity> {
    const match = await this.matchesRepository.findById(id);
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  async create(data: Partial<MatchEntity>): Promise<MatchEntity> {
    return this.matchesRepository.create(data);
  }

  async findByMatchId(matchId: string): Promise<MatchEntity | null> {
    return this.matchesRepository.findByMatchId(matchId);
  }

  async update(id: string, data: Partial<MatchEntity>): Promise<MatchEntity> {
    const match = await this.matchesRepository.update(id, data);
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }
}
