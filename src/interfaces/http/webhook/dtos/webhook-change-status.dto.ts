import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';

/**
 * Fica na camada de interface, e nao junto dos DTOs de aplicacao, porque
 * carrega `token` — uma credencial de transporte. O use case nao deve nem
 * conseguir enxergar o segredo do webhook.
 */
export class WebhookChangeStatusDto {
  @ApiProperty({
    enum: ServiceOrderStatus,
    description: 'Novo status da ordem de serviço',
    example: ServiceOrderStatus.EM_EXECUCAO,
  })
  @IsEnum(ServiceOrderStatus)
  @IsNotEmpty()
  status!: ServiceOrderStatus;

  @ApiProperty({
    description: 'Identificacao de quem originou a mudanca no sistema externo',
    example: 'gateway-email',
  })
  @IsString()
  @IsNotEmpty()
  changedBy!: string;

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
