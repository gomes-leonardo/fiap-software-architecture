import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AdminSeeder } from '@infrastructure/auth/admin.seeder';
import { buildJwtModuleOptions } from '@infrastructure/auth/jwt.config';
import { JwtStrategy } from '@infrastructure/auth/jwt.strategy';
import { AdminRepository } from '@domain/admin/admin-repository.port';
import { AdminTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/admin.typeorm-repository';
import { AdminOrmEntity } from '@infrastructure/database/typeorm/entities/admin.orm-entity';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([AdminOrmEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildJwtModuleOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    AdminSeeder,
    {
      provide: AdminRepository,
      useClass: AdminTypeOrmRepository,
    },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
