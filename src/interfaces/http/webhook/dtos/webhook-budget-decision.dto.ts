import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * A decisao do cliente cabe na URL (`/approve` ou `/refuse`): o corpo existe so
 * para carregar a credencial de transporte, e por isso o DTO fica na camada de
 * interface, longe do use case.
 */
export class WebhookBudgetDecisionDto {
  @ApiPropertyOptional({
    description:
      'Segredo pre-compartilhado. Prefira enviar em `Authorization: Bearer <segredo>` — ' +
      'corpo de requisicao costuma ser registrado em log de acesso e em dump de erro. ' +
      'Este campo existe para integracoes que nao permitem customizar cabecalhos.',
  })
  @IsOptional()
  @IsString()
  token?: string;
}
