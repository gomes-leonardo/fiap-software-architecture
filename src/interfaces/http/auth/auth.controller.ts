import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail, MinLength } from 'class-validator';
import { AdminRepository } from '@domain/admin/admin-repository.port';
import { Admin } from '@domain/admin/admin.entity';
import { DomainException } from '@domain/shared';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';
import { RolesGuard } from '@infrastructure/auth/roles.guard';
import { Roles } from '@infrastructure/auth/roles.decorator';
import { ADMIN_TOKEN_ISSUER, Role } from '@infrastructure/auth/role.enum';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('soat-app');

class LoginDto {
  @ApiProperty({ example: 'admin@oficina.com', description: 'Email do administrador' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'admin123', description: 'Senha do administrador' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

class RegisterAdminDto {
  @ApiProperty({ example: 'Vinicius Admin', description: 'Nome do administrador' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'admin@oficina.com', description: 'Email do administrador' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'admin123', description: 'Senha (mínimo 6 caracteres)' })
  @IsString()
  @MinLength(6)
  password!: string;
}

class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  access_token!: string;
}

class RegisterResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly adminRepository: AdminRepository,
  ) {}

  /**
   * Criar administrador exige ser administrador. Sem `@Roles(Role.ADMIN)`, um
   * token de cliente emitido pela autenticacao por CPF criaria um admin: o
   * segredo e o mesmo, entao so o papel no token separa os dois.
   *
   * O guard fica no metodo, nao na classe, porque `login` precisa continuar
   * publico — e de onde vem o token que este endpoint passa a exigir.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Registrar novo administrador (requer admin autenticado)' })
  @ApiResponse({ status: 201, description: 'Admin registrado', type: RegisterResponseDto })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou email já existe' })
  @ApiResponse({ status: 401, description: 'Token ausente ou inválido' })
  @ApiResponse({ status: 403, description: 'Token sem papel de administrador' })
  async register(@Body() dto: RegisterAdminDto): Promise<RegisterResponseDto> {
    const exists = await this.adminRepository.existsByEmail(dto.email.toLowerCase());
    if (exists) {
      throw DomainException.of(`Admin with email '${dto.email}' already exists`);
    }

    const admin = await Admin.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
    });

    await this.adminRepository.save(admin);

    return { id: admin.id, name: admin.name, email: admin.email };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar administrador' })
  @ApiResponse({ status: 200, description: 'JWT token retornado', type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    const admin = await this.adminRepository.findByEmail(dto.email.toLowerCase());
    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await tracer.startActiveSpan('auth.verify_password', async (span) => {
      try {
        return await admin.verifyPassword(dto.password);
      } finally {
        span.end();
      }
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: admin.id, email: admin.email, role: Role.ADMIN };
    const token = this.jwtService.sign(payload, { issuer: ADMIN_TOKEN_ISSUER });

    return { access_token: token };
  }
}
