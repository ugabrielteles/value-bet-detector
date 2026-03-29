import { Controller, Post, Get, Param, Body, UseGuards, Query } from '@nestjs/common';
import { SimulatorService } from './simulator.service';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RunSimulationDto } from './application/dtos/run-simulation.dto';
import { UserEntity } from '../auth/domain/entities/user.entity';

@Controller('simulator')
@UseGuards(JwtAuthGuard)
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Post('run')
  async runSimulation(@CurrentUser() user: UserEntity, @Body() dto: RunSimulationDto) {
    return this.simulatorService.runSimulation(user.id, dto);
  }

  @Get()
  async getUserSimulations(
    @CurrentUser() user: UserEntity,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? Number(page) : 1;
    const parsedLimit = limit ? Number(limit) : 20;

    return this.simulatorService.getUserSimulations(
      user.id,
      Number.isFinite(parsedPage) ? parsedPage : 1,
      Number.isFinite(parsedLimit) ? parsedLimit : 20,
    );
  }

  @Get(':id')
  async getSimulation(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.simulatorService.getSimulation(id, user.id);
  }

  @Get(':id/summary')
  async getSimulationSummary(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.simulatorService.getSimulationSummary(id, user.id);
  }

  @Get(':id/bets')
  async getSimulationBets(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? Number(page) : 1;
    const parsedLimit = limit ? Number(limit) : 100;

    return this.simulatorService.getSimulationBets(
      user.id,
      id,
      Number.isFinite(parsedPage) ? parsedPage : 1,
      Number.isFinite(parsedLimit) ? parsedLimit : 100,
    );
  }

  @Get(':id/chart')
  async getChart(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    const sim = await this.simulatorService.getSimulation(id, user.id);
    return this.simulatorService.buildChartData(sim);
  }
}
