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
   * Criar administrador exige ser administrador. Sem o guard, este endpoint era
   * uma escalada de privilegio em um passo: qualquer pessoa com acesso de rede
   * criava a propria conta, fazia login e passava a ler CPF/CNPJ de todos os
   * clientes, veiculos, OS e estoque — o mesmo que os demais controllers
   * protegem com `JwtAuthGuard`.
   *
   * O guard fica no metodo, nao na classe, porque `login` precisa continuar
   * publico — e de onde vem o token que este endpoint passa a exigir.
   *
   * `RolesGuard` + `@Roles('admin')` nao entram aqui: hoje o unico principal
   * que existe e um admin (o payload de `login` fixa `role: 'admin'`), entao a
   * checagem nao decidiria nada e daria a impressao de um RBAC que o sistema
   * nao tem. Ele volta a fazer sentido quando existir um segundo papel.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Registrar novo administrador (requer admin autenticado)' })
  @ApiResponse({ status: 201, description: 'Admin registrado', type: RegisterResponseDto })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou email já existe' })
  @ApiResponse({ status: 401, description: 'Token ausente ou inválido' })
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

    const isValid = await admin.verifyPassword(dto.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: admin.id, email: admin.email, role: 'admin' };
    const token = this.jwtService.sign(payload);

    return { access_token: token };
  }
}
