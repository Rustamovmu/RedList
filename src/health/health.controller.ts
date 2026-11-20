import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';

class HealthDto {
  @ApiProperty({ example: 'ok' }) status!: 'ok';
}
class ReadyDto extends HealthDto {
  @ApiProperty({ example: '3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1' }) postgis!: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Process is up. */
  @Get('live')
  @ApiOkResponse({ type: HealthDto })
  live(): HealthDto {
    return { status: 'ok' };
  }

  /** Database and PostGIS are reachable. */
  @Get('ready')
  @ApiOkResponse({ type: ReadyDto })
  async ready(): Promise<ReadyDto> {
    try {
      const { rows } = await this.pool.query<{ v: string }>('SELECT postgis_version() AS v');
      return { status: 'ok', postgis: rows[0].v };
    } catch {
      throw new ServiceUnavailableException('Database not ready');
    }
  }
}
