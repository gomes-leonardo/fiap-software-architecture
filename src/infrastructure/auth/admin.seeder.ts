import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminRepository } from '@domain/admin/admin-repository.port';
import { Admin } from '@domain/admin/admin.entity';

interface AdminCredentials {
  name: string;
  email: string;
  password: string;
}

/**
 * Credenciais de conveniencia para desenvolvimento, as mesmas documentadas no
 * README. Publicas de proposito — e por isso que elas nao podem existir fora de
 * dev.
 */
export const DEV_ADMIN: AdminCredentials = {
  name: 'Admin Padrão',
  email: 'admin@oficina.com',
  password: 'admin123',
};

const BOOTSTRAP_HINT =
  'Nenhum administrador foi semeado. Defina ADMIN_BOOTSTRAP_EMAIL e ' +
  'ADMIN_BOOTSTRAP_PASSWORD para criar o primeiro administrador.';

/**
 * Cria o administrador inicial no boot.
 *
 * Duas coisas mudaram em relacao ao seed que rodava no construtor do
 * `AuthController`:
 *
 * 1. **Ambiente.** `admin@oficina.com` / `admin123` esta no README e neste
 *    arquivo. Semear isso com `NODE_ENV=production` — que era o que acontecia,
 *    porque nada checava o ambiente — entrega uma conta de administrador com
 *    senha publicada para quem chegar primeiro. Em producao o seed de
 *    conveniencia nao roda; o unico caminho e `ADMIN_BOOTSTRAP_*`, que a pessoa
 *    define com um valor proprio.
 *
 * 2. **Ciclo de vida.** Construtor nao pode esperar I/O assincrono, entao a
 *    chamada ficava sem `await`: a promise corria solta depois de o Nest ja ter
 *    considerado o controller pronto, e uma rejeicao (banco fora, email
 *    duplicado) virava `unhandledRejection` sem nada no log. `OnModuleInit` e o
 *    gancho que o Nest aguarda de fato — o boot so termina depois do seed, e um
 *    erro aqui derruba a inicializacao em vez de sumir.
 */
@Injectable()
export class AdminSeeder implements OnModuleInit {
  private readonly logger = new Logger(AdminSeeder.name);

  constructor(
    private readonly config: ConfigService,
    private readonly adminRepository: AdminRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    const bootstrap = this.bootstrapCredentials();

    if (bootstrap) {
      await this.createIfMissing(bootstrap);
      return;
    }

    if (this.isProduction()) {
      this.logger.warn(BOOTSTRAP_HINT);
      return;
    }

    await this.createIfMissing(DEV_ADMIN);
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /**
   * Credenciais explicitas vencem o default de dev em qualquer ambiente: quem
   * define as variaveis quer aquele administrador, nao o `admin@oficina.com`.
   */
  private bootstrapCredentials(): AdminCredentials | null {
    const email = this.config.get<string>('ADMIN_BOOTSTRAP_EMAIL');
    const password = this.config.get<string>('ADMIN_BOOTSTRAP_PASSWORD');

    if (!email || !password) {
      return null;
    }

    return {
      name: this.config.get<string>('ADMIN_BOOTSTRAP_NAME') || 'Administrador',
      email,
      password,
    };
  }

  private async createIfMissing(credentials: AdminCredentials): Promise<void> {
    const email = credentials.email.trim().toLowerCase();

    if (await this.adminRepository.existsByEmail(email)) {
      return;
    }

    const admin = await Admin.create({ ...credentials, email });
    await this.adminRepository.save(admin);

    this.logger.log(`Administrador inicial criado: ${admin.email}`);
  }
}
