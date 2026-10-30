import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface DailyCount {
  date: string;
  count: number;
}

export interface StatusDuration {
  status: string;
  seconds: number;
}

export interface StalledCount {
  status: string;
  count: number;
}

export const METRICS_TIME_ZONE = 'America/Sao_Paulo';
export const STALLED_STATUSES = ['AGUARDANDO_APROVACAO', 'EM_DIAGNOSTICO'];

/**
 * Leituras agregadas para os paineis da direcao. Todas em SQL: o volume de uma
 * oficina cabe numa varredura, e conferir o painel contra o banco (criterio da
 * issue #62) fica uma questao de rodar a mesma consulta.
 *
 * `created_at` e `timestamp` sem fuso gravado em UTC; o dia de negocio e o de
 * Sao Paulo.
 */
@Injectable()
export class ServiceOrderMetricsQuery {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** OS criadas por dia, nos ultimos `days` dias incluindo hoje, com zeros explicitos. */
  async createdByDay(days: number, now: Date = new Date()): Promise<DailyCount[]> {
    const rows: Array<{ date: string; count: number }> = await this.dataSource.query(
      `
      WITH days AS (
        SELECT generate_series(
          (($1::timestamptz AT TIME ZONE $2)::date - ($3::int - 1)),
          ($1::timestamptz AT TIME ZONE $2)::date,
          interval '1 day'
        )::date AS day
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(so.id)::int AS count
      FROM days d
      LEFT JOIN service_orders so
        ON so.deleted_at IS NULL
       AND ((so.created_at AT TIME ZONE 'UTC') AT TIME ZONE $2)::date = d.day
      GROUP BY d.day
      ORDER BY d.day
      `,
      [now.toISOString(), METRICS_TIME_ZONE, days],
    );
    return rows;
  }

  /**
   * Tempo medio em cada status, em segundos. Cada passagem por um status vai da
   * transicao que entrou nele ate a seguinte; so contam passagens encerradas
   * dentro da janela, porque uma OS ainda parada no status nao tem duracao.
   */
  async averageStatusDuration(
    windowDays: number,
    now: Date = new Date(),
  ): Promise<StatusDuration[]> {
    const rows: Array<{ status: string; seconds: string }> = await this.dataSource.query(
      `
      WITH transitions AS (
        SELECT so.id,
               e->>'toStatus' AS status,
               (e->>'changedAt')::timestamptz AS entered_at,
               lead((e->>'changedAt')::timestamptz) OVER (
                 PARTITION BY so.id ORDER BY (e->>'changedAt')::timestamptz, ord
               ) AS left_at
        FROM service_orders so,
             jsonb_array_elements(so.status_history) WITH ORDINALITY AS h(e, ord)
        WHERE so.deleted_at IS NULL
      )
      SELECT status, avg(extract(epoch FROM left_at - entered_at)) AS seconds
      FROM transitions
      WHERE left_at IS NOT NULL
        AND left_at > $1::timestamptz - make_interval(days => $2::int)
      GROUP BY status
      ORDER BY status
      `,
      [now.toISOString(), windowDays],
    );
    return rows.map((row) => ({ status: row.status, seconds: Number(row.seconds) }));
  }

  /** OS paradas: no status ha mais de `thresholdHours` horas, sem transicao. */
  async stalled(thresholdHours: number, now: Date = new Date()): Promise<StalledCount[]> {
    const rows: Array<{ status: string; count: number }> = await this.dataSource.query(
      `
      SELECT s.status, count(so.id)::int AS count
      FROM unnest($3::text[]) AS s(status)
      LEFT JOIN service_orders so
        ON so.status = s.status
       AND so.deleted_at IS NULL
       AND (
         SELECT max((e->>'changedAt')::timestamptz)
         FROM jsonb_array_elements(so.status_history) e
       ) < $1::timestamptz - make_interval(hours => $2::int)
      GROUP BY s.status
      ORDER BY s.status
      `,
      [now.toISOString(), thresholdHours, STALLED_STATUSES],
    );
    return rows;
  }
}
