import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ApproveBudgetUseCase } from '@application/budget/approve-budget.use-case';
import { RefuseBudgetUseCase } from '@application/budget/refuse-budget.use-case';
import { BudgetResponseDto } from '@application/budget/dtos/budget-response.dto';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';
import { WebhookAuthGuard } from '@interfaces/http/guards/webhook-auth.guard';
import { BudgetWebhookController } from '@interfaces/http/webhook/budget-webhook.controller';

const BUDGET_ID = 'b0000000-0000-4000-8000-000000000001';

function responseFor(status: string): BudgetResponseDto {
  const dto = new BudgetResponseDto();
  dto.id = BUDGET_ID;
  dto.status = status;
  return dto;
}

type Handler = 'approve' | 'refuse';

const HANDLERS: Handler[] = ['approve', 'refuse'];

function guardsOn(handler: Handler): unknown[] {
  return Reflect.getMetadata(GUARDS_METADATA, BudgetWebhookController.prototype[handler]) ?? [];
}

describe('BudgetWebhookController', () => {
  let approveBudget: jest.Mocked<ApproveBudgetUseCase>;
  let refuseBudget: jest.Mocked<RefuseBudgetUseCase>;
  let controller: BudgetWebhookController;

  beforeEach(() => {
    approveBudget = { execute: jest.fn() } as unknown as jest.Mocked<ApproveBudgetUseCase>;
    refuseBudget = { execute: jest.fn() } as unknown as jest.Mocked<RefuseBudgetUseCase>;
    controller = new BudgetWebhookController(approveBudget, refuseBudget);
  });

  /**
   * O ponto da issue: reaproveitar os casos de uso. Se o controller montasse a
   * decisao por conta propria, a baixa de estoque e o vinculo com a OS ficariam
   * de fora do caminho externo.
   */
  it('delega a aprovacao ao ApproveBudgetUseCase', async () => {
    approveBudget.execute.mockResolvedValue(responseFor('APROVADO'));

    await expect(controller.approve(BUDGET_ID)).resolves.toMatchObject({ status: 'APROVADO' });
    expect(approveBudget.execute).toHaveBeenCalledWith(BUDGET_ID);
    expect(refuseBudget.execute).not.toHaveBeenCalled();
  });

  it('delega a recusa ao RefuseBudgetUseCase', async () => {
    refuseBudget.execute.mockResolvedValue(responseFor('RECUSADO'));

    await expect(controller.refuse(BUDGET_ID)).resolves.toMatchObject({ status: 'RECUSADO' });
    expect(refuseBudget.execute).toHaveBeenCalledWith(BUDGET_ID);
    expect(approveBudget.execute).not.toHaveBeenCalled();
  });

  it('propaga o erro do caso de uso em vez de engoli-lo', async () => {
    approveBudget.execute.mockRejectedValue(new Error('Estoque insuficiente'));

    await expect(controller.approve(BUDGET_ID)).rejects.toThrow('Estoque insuficiente');
  });

  /**
   * A rota so cumpre o requisito se for publica e guardada pelo segredo. Um
   * `JwtAuthGuard` herdado por engano fecharia o canal do cliente final; a
   * ausencia do `WebhookAuthGuard` abriria a aprovacao para qualquer um.
   */
  describe.each(HANDLERS)('rota %s', (handler) => {
    it('exige o WebhookAuthGuard e nao o JwtAuthGuard', () => {
      expect(guardsOn(handler)).toContain(WebhookAuthGuard);
      expect(guardsOn(handler)).not.toContain(JwtAuthGuard);
      expect(Reflect.getMetadata(GUARDS_METADATA, BudgetWebhookController)).toBeUndefined();
    });

    it('responde POST com 200, e nao o 201 padrao do Nest', () => {
      const method = BudgetWebhookController.prototype[handler];
      expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(`:id/${handler}`);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, method)).toBe(200);
    });
  });

  it('fica sob o prefixo publico de webhooks', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BudgetWebhookController)).toBe('webhooks/budgets');
  });
});
