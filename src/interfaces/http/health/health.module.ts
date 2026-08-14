import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Nao importa TypeOrmModule: o TypeOrmCoreModule registrado por
 * `TypeOrmModule.forRoot()` no AppModule e global, entao o DataSource ja esta
 * disponivel para injecao aqui.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
