import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderResponseDto } from './service-order-response.dto';

export class CreateServiceOrderResponseDto extends ServiceOrderResponseDto {
  @ApiPropertyOptional({
    description:
      'ID do orcamento criado a partir dos itens inline, ou null se nenhum item foi informado. ' +
      'Nao confundir com `budgetId`: aquele so e preenchido quando o orcamento e APROVADO, ' +
      'porque e ele que destranca a transicao para EM_EXECUCAO.',
    nullable: true,
  })
  createdBudgetId!: string | null;

  @ApiProperty({
    type: [String],
    description:
      'Avisos de estoque insuficiente. Nao bloqueiam a abertura da OS — o estoque so e ' +
      'decrementado na aprovacao do orcamento, e e la que a falta de peca barra o fluxo.',
    example: [],
  })
  stockWarnings!: string[];

  static from(
    serviceOrder: ServiceOrder,
    createdBudgetId: string | null,
    stockWarnings: string[],
  ): CreateServiceOrderResponseDto {
    const dto = new CreateServiceOrderResponseDto();
    Object.assign(dto, ServiceOrderResponseDto.fromDomain(serviceOrder));
    dto.createdBudgetId = createdBudgetId;
    dto.stockWarnings = stockWarnings;
    return dto;
  }
}
