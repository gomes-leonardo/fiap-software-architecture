import { Injectable } from '@nestjs/common';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { PartRepository } from '@domain/part/part-repository.port';

export interface LowStockPart {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
}

export interface OperationalReportResult {
  ordersByStatus: Record<string, number>;
  totalOrders: number;
  lowStockParts: LowStockPart[];
  averageExecutionTimeMinutes: number;
  totalCompleted: number;
}

@Injectable()
export class OperationalReportUseCase {
  private static readonly LOW_STOCK_THRESHOLD = 5;

  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly partRepository: PartRepository,
  ) {}

  async execute(): Promise<OperationalReportResult> {
    const allOrders = await this.serviceOrderRepository.findAll();
    const allParts = await this.partRepository.findAll();

    // Count OS by status
    const ordersByStatus: Record<string, number> = {};
    for (const status of Object.values(ServiceOrderStatus)) {
      ordersByStatus[status] = 0;
    }
    for (const order of allOrders) {
      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
    }

    // Low stock parts
    const lowStockParts: LowStockPart[] = allParts
      .filter((p) => p.stockQuantity <= OperationalReportUseCase.LOW_STOCK_THRESHOLD)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stockQuantity: p.stockQuantity,
      }));

    // Average execution time (reuse logic from AverageExecutionTimeUseCase)
    const completedOrders = allOrders.filter(
      (o) => o.status === ServiceOrderStatus.FINALIZADA || o.status === ServiceOrderStatus.ENTREGUE,
    );

    let totalMinutes = 0;
    let counted = 0;

    for (const order of completedOrders) {
      const entries = order.statusHistory.entries;
      const startEntry = entries.find((e) => e.toStatus === ServiceOrderStatus.EM_EXECUCAO);
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
      ordersByStatus,
      totalOrders: allOrders.length,
      lowStockParts,
      averageExecutionTimeMinutes: counted > 0 ? Math.round(totalMinutes / counted) : 0,
      totalCompleted: counted,
    };
  }
}
