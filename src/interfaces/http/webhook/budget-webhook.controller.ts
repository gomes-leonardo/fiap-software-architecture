import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApproveBudgetUseCase } from '@application/budget/approve-budget.use-case';
import { RefuseBudgetUseCase } from '@application/budget/refuse-budget.use-case';
import { BudgetResponseDto } from '@application/budget/dtos/budget-response.dto';
import { WebhookAuthGuard } from '../guards/webhook-auth.guard';
import { WebhookBudgetDecisionDto } from './dtos/webhook-budget-decision.dto';

const EXTERNAL_CHANNEL_NOTE =
  'Canal de integracao externa: e por aqui que a decisao do cliente final chega, ' +
  'sem login. O equivalente interno e `PATCH /budgets/{id}/{acao}`, usado pelo ' +
  'funcionario da oficina e protegido por JWT. Os dois caem no mesmo caso de uso — ' +
  'muda so quem prova identidade: aqui, o segredo pre-compartilhado `WEBHOOK_SECRET`, ' +
  'enviado em `Authorization: Bearer <segredo>` ou, como alternativa, no campo `token` ' +
  'do corpo.';

/**
 * Aprovacao e recusa vindas de fora, sem usuario autenticado.
 *
 * Delega aos mesmos `ApproveBudgetUseCase`/`RefuseBudgetUseCase` do
 * `BudgetController`. Isso nao e economia de codigo: a aprovacao reserva peca em
 * estoque e vincula o orcamento a OS (liberando EM_EXECUCAO), e a recusa encerra
 * a OS sem execucao. Um caminho externo que apenas mudasse o status do orcamento
 * pularia tudo isso — o orcamento ficaria APROVADO com estoque intacto e a OS
 * travada.
 */
@ApiTags('webhooks')
@Controller('webhooks/budgets')
export class BudgetWebhookController {
  constructor(
    private readonly approveBudget: ApproveBudgetUseCase,
    private readonly refuseBudget: RefuseBudgetUseCase,
  ) {}

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WebhookAuthGuard)
  @ApiOperation({
    summary: 'Aprovar orçamento a partir de um canal externo',
    description:
      `${EXTERNAL_CHANNEL_NOTE} A aprovacao da baixa no estoque das pecas do ` +
      'orcamento e vincula o orcamento a OS. Estoque insuficiente bloqueia a ' +
      'aprovacao inteira, sem decrementar nada.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer <WEBHOOK_SECRET>. Forma preferida de apresentar o segredo.',
    required: false,
  })
  @ApiBody({ type: WebhookBudgetDecisionDto, required: false })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Orçamento inexistente, já aprovado/recusado (só um orçamento PENDENTE ' +
      'aceita decisão) ou estoque insuficiente para alguma peça',
  })
  @ApiResponse({ status: 401, description: 'Segredo do webhook ausente ou inválido' })
  async approve(@Param('id') id: string): Promise<BudgetResponseDto> {
    return this.approveBudget.execute(id);
  }

  @Post(':id/refuse')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WebhookAuthGuard)
  @ApiOperation({
    summary: 'Recusar orçamento a partir de um canal externo',
    description:
      `${EXTERNAL_CHANNEL_NOTE} A recusa encerra a OS sem execucao quando ela ` +
      'estiver AGUARDANDO_APROVACAO.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer <WEBHOOK_SECRET>. Forma preferida de apresentar o segredo.',
    required: false,
  })
  @ApiBody({ type: WebhookBudgetDecisionDto, required: false })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Orçamento inexistente ou já aprovado/recusado (só um orçamento PENDENTE aceita decisão)',
  })
  @ApiResponse({ status: 401, description: 'Segredo do webhook ausente ou inválido' })
  async refuse(@Param('id') id: string): Promise<BudgetResponseDto> {
    return this.refuseBudget.execute(id);
  }
}
