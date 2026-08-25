import { Injectable } from '@nestjs/common';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';

export interface AverageExecutionTimeResult {
  averageMinutes: number;
  totalCompleted: number;
}

@Injectable()
export class AverageExecutionTimeUseCase {
  constructor(private readonly serviceOrderRepository: ServiceOrderRepository) {}

  async execute(): Promise<AverageExecutionTimeResult> {
    // Get all finalized or delivered orders (completed flow)
    const finalized = await this.serviceOrderRepository.findByStatus(ServiceOrderStatus.FINALIZADA);
    const delivered = await this.serviceOrderRepository.findByStatus(ServiceOrderStatus.ENTREGUE);

    const completedOrders = [...finalized, ...delivered];

    if (completedOrders.length === 0) {
      return { averageMinutes: 0, totalCompleted: 0 };
    }

    let totalMinutes = 0;
    let counted = 0;

    for (const order of completedOrders) {
      const entries = order.statusHistory.entries;

      // Find when execution started (EM_EXECUCAO)
      const startEntry = entries.find((e) => e.toStatus === ServiceOrderStatus.EM_EXECUCAO);
      // Find when execution finished (FINALIZADA)
      const endEntry = entries.find((e) => e.toStatus === ServiceOrderStatus.FINALIZADA);

      if (startEntry && endEntry) {
        const startTime = new Date(startEntry.changedAt).getTime();
        const endTime = new Date(endEntry.changedAt).getTime();
        const diffMinutes = (endTime - startTime) / (1000 * 60);

        if (diffMinutes > 0) {
          totalMinutes += diffMinutes;
          counted++;
        }
      }
    }

    return {
      averageMinutes: counted > 0 ? Math.round(totalMinutes / counted) : 0,
      totalCompleted: counted,
    };
  }
}
