import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
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
  async getUserSimulations(@CurrentUser() user: UserEntity) {
    return this.simulatorService.getUserSimulations(user.id);
  }

  @Get(':id')
  async getSimulation(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.simulatorService.getSimulation(id, user.id);
  }

  @Get(':id/chart')
  async getChart(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    const sim = await this.simulatorService.getSimulation(id, user.id);
    return this.simulatorService.buildChartData(sim);
  }
}
