/**
 * Soft delete e uma decisao de persistencia: o unico jeito de provar que a
 * linha continua no banco e que as consultas param de enxerga-la e rodando
 * contra um Postgres de verdade. Por isso este teste vive na camada de
 * integracao, e nao em unitarios com repositorio fake.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';

import { setupTestDb, teardownTestDb, truncateAllTables } from '../../helpers/test-db.helper';
import { ClientOrmEntity } from '@infrastructure/database/typeorm/entities/client.orm-entity';
import { VehicleOrmEntity } from '@infrastructure/database/typeorm/entities/vehicle.orm-entity';
import { PartOrmEntity } from '@infrastructure/database/typeorm/entities/part.orm-entity';
import { ServiceOrmEntity } from '@infrastructure/database/typeorm/entities/service.orm-entity';
import { ServiceOrderOrmEntity } from '@infrastructure/database/typeorm/entities/service-order.orm-entity';
import { BudgetOrmEntity } from '@infrastructure/database/typeorm/entities/budget.orm-entity';
import { ClientTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/client.typeorm-repository';
import { VehicleTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/vehicle.typeorm-repository';
import { PartTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/part.typeorm-repository';
import { ServiceTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/service.typeorm-repository';
import { ServiceOrderTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/service-order.typeorm-repository';
import { BudgetTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/budget.typeorm-repository';
import { Client } from '@domain/client/client.entity';
import { Vehicle } from '@domain/vehicle/vehicle.entity';
import { Part } from '@domain/part/part.entity';
import { Service } from '@domain/service/service.entity';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { Budget } from '@domain/budget/budget.entity';
import { BudgetLineType } from '@domain/budget/budget-line.vo';
import { ClientRepository } from '@domain/client/client-repository.port';
import { ClientController } from '@interfaces/http/client/client.controller';
import { RegisterClientUseCase } from '@application/client/register-client.use-case';
import { FindClientUseCase } from '@application/client/find-client.use-case';
import { DomainExceptionFilter } from '@interfaces/http/filters/domain-exception.filter';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';

const CLIENT_ID = '22222222-2222-4222-8222-222222222222';

describe('Soft delete', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let clients: ClientTypeOrmRepository;
  let vehicles: VehicleTypeOrmRepository;
  let parts: PartTypeOrmRepository;
  let services: ServiceTypeOrmRepository;
  let serviceOrders: ServiceOrderTypeOrmRepository;
  let budgets: BudgetTypeOrmRepository;

  beforeAll(async () => {
    dataSource = await setupTestDb();
    clients = new ClientTypeOrmRepository(dataSource.getRepository(ClientOrmEntity));
    vehicles = new VehicleTypeOrmRepository(dataSource.getRepository(VehicleOrmEntity));
    parts = new PartTypeOrmRepository(dataSource.getRepository(PartOrmEntity));
    services = new ServiceTypeOrmRepository(dataSource.getRepository(ServiceOrmEntity));
    serviceOrders = new ServiceOrderTypeOrmRepository(
      dataSource.getRepository(ServiceOrderOrmEntity),
    );
    budgets = new BudgetTypeOrmRepository(dataSource.getRepository(BudgetOrmEntity));

    const moduleRef = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        RegisterClientUseCase,
        FindClientUseCase,
        { provide: ClientRepository, useValue: clients },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
  });

  describe('client', () => {
    it('keeps the row in the database and hides it from every query', async () => {
      const client = new Client({ name: 'João', cpfCnpj: '529.982.247-25' });
      await clients.save(client);

      await clients.delete(client.id);

      expect(await clients.findById(client.id)).toBeNull();
      expect(await clients.findByCpfCnpj('52998224725')).toBeNull();
      expect(await clients.findAll()).toHaveLength(0);
      expect(await clients.existsByCpfCnpj('52998224725')).toBe(false);

      const raw = await dataSource
        .getRepository(ClientOrmEntity)
        .findOne({ where: { id: client.id }, withDeleted: true });
      expect(raw).not.toBeNull();
      expect(raw!.deletedAt).toBeInstanceOf(Date);
    });

    it('brings the row back with restore', async () => {
      const client = new Client({ name: 'Maria', cpfCnpj: '111.444.777-35' });
      await clients.save(client);
      await clients.delete(client.id);

      await clients.restore(client.id);

      const found = await clients.findById(client.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Maria');
      expect(await clients.findAll()).toHaveLength(1);
    });

    it('frees the CPF/CNPJ for a new registration', async () => {
      const first = new Client({ name: 'Carlos', cpfCnpj: '529.982.247-25' });
      await clients.save(first);
      await clients.delete(first.id);

      const second = new Client({ name: 'Carlos II', cpfCnpj: '529.982.247-25' });
      await clients.save(second);

      const found = await clients.findByCpfCnpj('52998224725');
      expect(found!.id).toBe(second.id);
    });
  });

  describe('vehicle', () => {
    it('hides the vehicle from every query and frees the plate', async () => {
      const vehicle = new Vehicle({
        plate: 'ABC1D23',
        brand: 'Fiat',
        model: 'Uno',
        year: 2020,
        ownerClientId: CLIENT_ID,
      });
      await vehicles.save(vehicle);

      await vehicles.delete(vehicle.id);

      expect(await vehicles.findById(vehicle.id)).toBeNull();
      expect(await vehicles.findByPlate('ABC1D23')).toBeNull();
      expect(await vehicles.findByOwnerClientId(CLIENT_ID)).toHaveLength(0);
      expect(await vehicles.findAll()).toHaveLength(0);
      expect(await vehicles.existsByPlate('ABC1D23')).toBe(false);

      const replacement = new Vehicle({
        plate: 'ABC1D23',
        brand: 'Fiat',
        model: 'Uno',
        year: 2021,
        ownerClientId: CLIENT_ID,
      });
      await expect(vehicles.save(replacement)).resolves.toBeUndefined();
    });
  });

  describe('part', () => {
    it('hides the part from every query and frees the SKU', async () => {
      const part = new Part({
        name: 'Filtro de óleo',
        sku: 'FLT-001',
        unitPrice: 45,
        stockQuantity: 10,
      });
      await parts.save(part);

      await parts.delete(part.id);

      expect(await parts.findById(part.id)).toBeNull();
      expect(await parts.findBySku('FLT-001')).toBeNull();
      expect(await parts.findAll()).toHaveLength(0);

      const replacement = new Part({
        name: 'Filtro de óleo',
        sku: 'FLT-001',
        unitPrice: 50,
        stockQuantity: 5,
      });
      await parts.save(replacement);
      expect((await parts.findBySku('FLT-001'))!.id).toBe(replacement.id);
    });
  });

  describe('service', () => {
    it('hides the service from every query and can be restored', async () => {
      const service = new Service({ name: 'Troca de óleo', basePrice: 120, estimatedMinutes: 30 });
      await services.save(service);

      await services.delete(service.id);
      expect(await services.findById(service.id)).toBeNull();
      expect(await services.findByName('Troca de óleo')).toBeNull();
      expect(await services.findAll()).toHaveLength(0);

      await services.restore(service.id);
      expect(await services.findByName('Troca de óleo')).not.toBeNull();
    });
  });

  describe('service order', () => {
    it('drops out of the listings, including the prioritized one', async () => {
      const kept = new ServiceOrder({ clientId: CLIENT_ID, description: 'Revisão' });
      const removed = new ServiceOrder({ clientId: CLIENT_ID, description: 'Barulho no motor' });
      await serviceOrders.save(kept);
      await serviceOrders.save(removed);

      await serviceOrders.delete(removed.id);

      expect(await serviceOrders.findById(removed.id)).toBeNull();
      expect(await serviceOrders.findAll()).toHaveLength(1);
      expect(await serviceOrders.findByClientId(CLIENT_ID)).toHaveLength(1);
      expect(await serviceOrders.findByStatus(ServiceOrderStatus.RECEBIDA)).toHaveLength(1);

      const active = await serviceOrders.findAllActive();
      expect(active.map((so) => so.id)).toEqual([kept.id]);
    });
  });

  describe('budget', () => {
    it('drops out of the service order history and of the latest version lookup', async () => {
      const serviceOrderId = '33333333-3333-4333-8333-333333333333';
      const lines = [
        {
          type: 'SERVICE' as BudgetLineType,
          referenceId: '44444444-4444-4444-8444-444444444444',
          description: 'Troca de óleo',
          quantity: 1,
          frozenUnitPrice: 120,
        },
      ];
      const first = new Budget({ serviceOrderId, lines });
      const second = new Budget({ serviceOrderId, lines, version: 2 });
      await budgets.save(first);
      await budgets.save(second);

      await budgets.delete(second.id);

      expect(await budgets.findById(second.id)).toBeNull();
      expect(await budgets.findByServiceOrderId(serviceOrderId)).toHaveLength(1);
      expect((await budgets.findLatestByServiceOrderId(serviceOrderId))!.id).toBe(first.id);
    });
  });

  describe('DELETE endpoint', () => {
    it('still answers 204 and turns the resource into a 404 afterwards', async () => {
      const created = await request(app.getHttpServer())
        .post('/clients')
        .send({ name: 'João', cpfCnpj: '529.982.247-25' })
        .expect(201);

      const id = created.body.id as string;

      await request(app.getHttpServer()).delete(`/clients/${id}`).expect(204);
      await request(app.getHttpServer()).get(`/clients/${id}`).expect(404);
      await request(app.getHttpServer()).delete(`/clients/${id}`).expect(404);

      const listed = await request(app.getHttpServer()).get('/clients').expect(200);
      expect(listed.body).toHaveLength(0);
    });
  });
});
