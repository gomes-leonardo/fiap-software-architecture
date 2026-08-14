import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'connected' | 'disconnected';
}

/**
 * Health check publico — sem JWT.
 * Usado pelo HEALTHCHECK do Docker e pelas probes (liveness/readiness) do
 * Kubernetes, que nao tem como apresentar credenciais.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({
    summary: 'Health check da aplicacao',
    description:
      'Verifica se a API responde e se a conexao com o banco esta ativa. ' +
      'Retorna 503 quando o banco esta inacessivel, para que o orquestrador ' +
      'tire a instancia do balanceamento.',
  })
  @ApiResponse({
    status: 200,
    description: 'Aplicacao e banco saudaveis',
    schema: {
      example: { status: 'ok', database: 'connected' },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Banco inacessivel',
    schema: {
      example: { status: 'error', database: 'disconnected' },
    },
  })
  async check(): Promise<HealthResponse> {
    if (!(await this.isDatabaseReachable())) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
      });
    }

    return { status: 'ok', database: 'connected' };
  }

  /**
   * Um SELECT 1 e suficiente: valida que ha conexao viva no pool e que o
   * Postgres responde, sem tocar em nenhuma tabela do dominio.
   */
  private async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
