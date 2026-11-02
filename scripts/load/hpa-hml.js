// Carga para a evidencia do HPA (docs/evidencias/hpa-hml.md). Roda dentro do
// cluster, direto no Service da app, para nao medir o Kong.
import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 40, duration: '3m' };
export default function () {
  const r = http.get('http://soat-app.soat-hml.svc:3000/api-docs-json');
  check(r, { '2xx': (res) => res.status >= 200 && res.status < 300 });
}
