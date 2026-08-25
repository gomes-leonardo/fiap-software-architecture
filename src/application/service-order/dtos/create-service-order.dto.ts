import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class RequestedItemDto {
  @ApiProperty({ description: 'ID do servico ou da peca no catalogo' })
  @IsUUID()
  @IsNotEmpty()
  referenceId!: string;

  @ApiProperty({ description: 'Quantidade', example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateServiceOrderDto {
  @ApiProperty({ description: 'ID do cliente' })
  @IsUUID()
  @IsNotEmpty()
  clientId!: string;

  @ApiPropertyOptional({ description: 'ID do veículo (opcional)' })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiProperty({
    description: 'Descrição do serviço solicitado',
    example: 'Troca de óleo e filtro',
  })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({
    type: [RequestedItemDto],
    description:
      'Servicos do catalogo a incluir no orcamento. Informando servicos e/ou pecas, a OS ' +
      'nasce com um orcamento PENDENTE e ja em AGUARDANDO_APROVACAO.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RequestedItemDto)
  services?: RequestedItemDto[];

  @ApiPropertyOptional({
    type: [RequestedItemDto],
    description:
      'Pecas do catalogo a incluir no orcamento. O preco vem do catalogo e e congelado; ' +
      'estoque insuficiente vira aviso em `stockWarnings`, nao erro.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RequestedItemDto)
  parts?: RequestedItemDto[];
}
