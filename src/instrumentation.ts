import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  SpanProcessor,
} from '@opentelemetry/sdk-trace';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// O SDK reporta as proprias falhas por `diag`, e sem logger registrado elas vao
// para o vazio: exportador sem destino alcancavel e porta de metrica ocupada
// viram ausencia silenciosa de dado, que e o pior sintoma possivel num sistema
// de observabilidade. So ERROR para nao poluir o stdout, que e o canal de log
// da aplicacao.
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
// `||` e nao `??`: uma variavel definida como vazia no .env deve cair no
// default, e nao virar string vazia (que o exportador trataria como `localhost`
// e deixaria o /metrics inalcancavel de outro container).
const metricsPort = Number(process.env.OTEL_METRICS_PORT || 9464);
const metricsHost = process.env.OTEL_METRICS_HOST || '0.0.0.0';

const processors: SpanProcessor[] = [
  new BatchSpanProcessor({
    exporter: new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),
  }),
];

if (process.env.OTEL_CONSOLE === '1') {
  processors.push(new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() }));
}

const sdk = new NodeSDK({
  serviceName: 'soat-app',
  spanProcessors: processors,
  metricReaders: [new PrometheusExporter({ host: metricsHost, port: metricsPort })],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  void sdk.shutdown().finally(() => process.exit(0));
});
