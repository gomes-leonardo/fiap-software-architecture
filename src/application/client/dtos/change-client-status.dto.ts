import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ClientStatus } from '@domain/client/client-status.enum';

export class ChangeClientStatusDto {
  @ApiProperty({ enum: ClientStatus, example: ClientStatus.INATIVO })
  @IsEnum(ClientStatus)
  status!: ClientStatus;
}
