import { Injectable } from '@nestjs/common';
import { BudgetLineType } from '@domain/budget/budget-line.vo';
import { PartRepository } from '@domain/part/part-repository.port';
import { ServiceRepository } from '@domain/service/service-repository.port';
import { DomainException } from '@domain/shared';

export interface RequestedLine {
  type: BudgetLineType;
  referenceId: string;
  quantity: number;
}

export interface ResolvedLine {
  type: BudgetLineType;
  referenceId: string;
  description: string;
  quantity: number;
  frozenUnitPrice: number;
}

/**
 * Traduz linhas pedidas (`type` + `referenceId` + `quantity`) em linhas de
 * orcamento, buscando descricao e preco no catalogo.
 *
 * Preco e descricao NUNCA vem do cliente da API: vem do catalogo e sao
 * congelados no momento da geracao. E isso que impede um preco arbitrario de
 * entrar num orcamento, e o que garante que o valor combinado nao muda depois
 * se o catalogo mudar.
 *
 * Extraido de `CreateBudgetUseCase` para ser reusado pela abertura de OS com
 * itens inline. Nao e so evitar duplicacao: as duas portas de entrada precisam
 * validar o catalogo do mesmo jeito, e a segunda copia seria a que ficaria para
 * tras quando a regra mudasse.
 */
@Injectable()
export class BudgetLineResolver {
  constructor(
    private readonly serviceRepository: ServiceRepository,
    private readonly partRepository: PartRepository,
  ) {}

  async resolve(lines: RequestedLine[]): Promise<ResolvedLine[]> {
    return Promise.all(lines.map((line) => this.resolveLine(line)));
  }

  /**
   * Aviso, nao bloqueio: o estoque so e decrementado na aprovacao do orcamento
   * (`ApproveBudgetUseCase`), e e la que a falta de peca barra o fluxo. Aqui o
   * objetivo e o admin descobrir o problema quando ainda da tempo de repor, em
   * vez de na hora de aprovar.
   */
  async stockWarnings(lines: ResolvedLine[]): Promise<string[]> {
    const requiredByPart = new Map<string, number>();
    for (const line of lines) {
      if (line.type === 'PART') {
        requiredByPart.set(
          line.referenceId,
          (requiredByPart.get(line.referenceId) ?? 0) + line.quantity,
        );
      }
    }

    const warnings: string[] = [];
    for (const [partId, required] of requiredByPart) {
      const part = await this.partRepository.findById(partId);
      // Peca inexistente ja teria estourado em `resolve`; aqui so o estoque importa.
      if (part && part.stockQuantity < required) {
        warnings.push(
          `Estoque insuficiente para a peca '${part.name}': ` +
            `disponivel=${part.stockQuantity}, necessario=${required}`,
        );
      }
    }
    return warnings;
  }

  private async resolveLine(line: RequestedLine): Promise<ResolvedLine> {
    if (line.type === 'SERVICE') {
      const service = await this.serviceRepository.findById(line.referenceId);
      if (!service) {
        throw DomainException.of(`Service '${line.referenceId}' not found`);
      }
      return {
        type: 'SERVICE',
        referenceId: line.referenceId,
        description: service.name,
        quantity: line.quantity,
        frozenUnitPrice: Number(service.basePrice),
      };
    }

    const part = await this.partRepository.findById(line.referenceId);
    if (!part) {
      throw DomainException.of(`Part '${line.referenceId}' not found`);
    }
    return {
      type: 'PART',
      referenceId: line.referenceId,
      description: part.name,
      quantity: line.quantity,
      frozenUnitPrice: Number(part.unitPrice),
    };
  }
}
