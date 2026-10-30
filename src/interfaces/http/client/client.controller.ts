import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RegisterClientUseCase } from '@application/client/register-client.use-case';
import { FindClientUseCase } from '@application/client/find-client.use-case';
import { RegisterClientDto } from '@application/client/dtos/register-client.dto';
import { UpdateClientDto } from '@application/client/dtos/update-client.dto';
import { ChangeClientStatusDto } from '@application/client/dtos/change-client-status.dto';
import { ClientResponseDto } from '@application/client/dtos/client-response.dto';
import { ClientRepository } from '@domain/client/client-repository.port';
import { ClientStatus } from '@domain/client/client-status.enum';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientController {
  constructor(
    private readonly registerClient: RegisterClientUseCase,
    private readonly findClient: FindClientUseCase,
    private readonly clientRepository: ClientRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar novo cliente' })
  @ApiResponse({
    status: 201,
    description: 'Cliente registrado com sucesso',
    type: ClientResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou CPF/CNPJ duplicado' })
  async register(@Body() dto: RegisterClientDto): Promise<ClientResponseDto> {
    return this.registerClient.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os clientes' })
  @ApiResponse({ status: 200, type: [ClientResponseDto] })
  @ApiQuery({ name: 'cpfCnpj', required: false, description: 'Filtrar por CPF/CNPJ' })
  async findAll(@Query('cpfCnpj') cpfCnpj?: string): Promise<ClientResponseDto[]> {
    if (cpfCnpj) {
      const client = await this.findClient.findByCpfCnpj(cpfCnpj);
      return client ? [client] : [];
    }
    return this.findClient.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar cliente por ID' })
  @ApiResponse({ status: 200, type: ClientResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  async findById(@Param('id') id: string): Promise<ClientResponseDto> {
    const client = await this.findClient.findById(id);
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar cliente' })
  @ApiResponse({ status: 200, type: ClientResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto): Promise<ClientResponseDto> {
    const client = await this.clientRepository.findById(id);
    if (!client) throw new NotFoundException('Client not found');

    client.update(dto);
    await this.clientRepository.save(client);

    return ClientResponseDto.fromDomain(client);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Ativar ou inativar cliente',
    description: 'Cliente INATIVO nao obtem token na autenticacao por CPF.',
  })
  @ApiResponse({ status: 200, type: ClientResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeClientStatusDto,
  ): Promise<ClientResponseDto> {
    const client = await this.clientRepository.findById(id);
    if (!client) throw new NotFoundException('Client not found');

    if (dto.status === ClientStatus.ATIVO) {
      client.activate();
    } else {
      client.deactivate();
    }
    await this.clientRepository.save(client);

    return ClientResponseDto.fromDomain(client);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover cliente' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  async remove(@Param('id') id: string): Promise<void> {
    const client = await this.clientRepository.findById(id);
    if (!client) throw new NotFoundException('Client not found');
    await this.clientRepository.delete(id);
  }
}
