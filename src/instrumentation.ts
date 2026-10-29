import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  SpanProcessor,
} from '@opentelemetry/sdk-trace';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

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
