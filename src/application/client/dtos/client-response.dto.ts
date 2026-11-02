import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Client } from '@domain/client/client.entity';
import { ClientStatus } from '@domain/client/client-status.enum';

export class ClientResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'CPF/CNPJ formatado' })
  cpfCnpj!: string;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiProperty({ enum: ClientStatus, example: ClientStatus.ATIVO })
  status!: ClientStatus;

  @ApiProperty({ type: [String], description: 'Veiculos ativos do cliente' })
  vehicleIds!: string[];

  static fromDomain(client: Client): ClientResponseDto {
    const dto = new ClientResponseDto();
    dto.id = client.id;
    dto.name = client.name;
    dto.cpfCnpj = client.cpfCnpj.formatted;
    dto.email = client.email;
    dto.phone = client.phone;
    dto.status = client.status;
    dto.vehicleIds = [...client.vehicleIds];
    return dto;
  }
}
