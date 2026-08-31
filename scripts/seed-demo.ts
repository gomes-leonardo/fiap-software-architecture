/**
 * Popula a base com dados de demonstracao, atravessando a API publica.
 *
 * Por que pela API e nao por SQL: a maquina de status, a baixa de estoque e o
 * vinculo entre orcamento e OS vivem no dominio. Um INSERT direto produziria
 * linhas que o banco aceita e a aplicacao considera invalidas — por exemplo uma
 * OS em EM_EXECUCAO sem orcamento aprovado, estado que `changeStatus` recusa.
 * Passando pelos endpoints, todo dado nasce consistente por construcao.
 *
 * Funciona contra qualquer ambiente: docker-compose, cluster local com
 * port-forward, ou um cluster remoto. So muda a URL.
 *
 *   npm run seed:demo
 *   API_URL=http://localhost:3000 npm run seed:demo
 */

const API = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@oficina.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? 'change-me-webhook-secret';
const FORCE = process.env.SEED_FORCE === '1';

const JSON_HEADER = { 'Content-Type': 'application/json' };

let token = '';

class SeedError extends Error {}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  auth: 'jwt' | 'webhook' | 'none' = 'jwt',
): Promise<T> {
  const headers: Record<string, string> = { ...JSON_HEADER };
  if (auth === 'jwt') headers.Authorization = `Bearer ${token}`;
  if (auth === 'webhook') headers.Authorization = `Bearer ${WEBHOOK_SECRET}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new SeedError(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * CPF valido de verdade: o cadastro roda o algoritmo dos digitos
 * verificadores, entao numero inventado e rejeitado com 400.
 */
function cpf(base: string): string {
  const digits = base.split('').map(Number);
  const check = (slice: number[], start: number): number => {
    const sum = slice.reduce((acc, d, i) => acc + d * (start - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = check(digits, 10);
  const d2 = check([...digits, d1], 11);
  const full = `${base}${d1}${d2}`;
  return `${full.slice(0, 3)}.${full.slice(3, 6)}.${full.slice(6, 9)}-${full.slice(9)}`;
}

interface Id {
  id: string;
}

const CLIENTS = [
  { name: 'Joao da Silva', base: '529982247', phone: '(11) 99872-1043' },
  { name: 'Maria Aparecida Souza', base: '111444777', phone: '(11) 98431-2290' },
  { name: 'Carlos Eduardo Ramos', base: '390533447', phone: '(21) 99120-8873' },
  { name: 'Fernanda Lima Costa', base: '128143740', phone: '(31) 98877-4412' },
  { name: 'Roberto Nogueira', base: '246813579', phone: '(41) 99654-1120' },
  { name: 'Patricia Mendes', base: '135792468', phone: '(51) 98120-7766' },
  { name: 'Anderson Pereira', base: '864197532', phone: '(61) 99503-8821' },
  { name: 'Juliana Barbosa', base: '753198642', phone: '(71) 98244-6690' },
];

const VEHICLES = [
  { plate: 'RKM-4A21', brand: 'Toyota', model: 'Corolla XEi', year: 2022 },
  { plate: 'BQP-7H09', brand: 'Honda', model: 'Civic EXL', year: 2021 },
  { plate: 'FTZ-2C88', brand: 'Volkswagen', model: 'Golf GTI', year: 2019 },
  { plate: 'JLD-9K34', brand: 'Fiat', model: 'Argo Drive', year: 2023 },
  { plate: 'MNS-5T17', brand: 'Chevrolet', model: 'Onix Plus', year: 2020 },
  { plate: 'PWX-3B62', brand: 'Hyundai', model: 'HB20S', year: 2022 },
  { plate: 'GVE-8L45', brand: 'Renault', model: 'Duster', year: 2018 },
  { plate: 'CZR-1N70', brand: 'Jeep', model: 'Renegade', year: 2021 },
  { plate: 'HYT-6D93', brand: 'Nissan', model: 'Kicks', year: 2023 },
  { plate: 'XSB-4F28', brand: 'Ford', model: 'Ranger XLS', year: 2020 },
];

const SERVICES = [
  { name: 'Troca de oleo e filtro', basePrice: 189.9, estimatedMinutes: 45 },
  { name: 'Alinhamento e balanceamento', basePrice: 149.0, estimatedMinutes: 60 },
  { name: 'Revisao de freios', basePrice: 320.0, estimatedMinutes: 120 },
  { name: 'Troca de correia dentada', basePrice: 890.0, estimatedMinutes: 240 },
  { name: 'Diagnostico eletronico', basePrice: 220.0, estimatedMinutes: 90 },
  { name: 'Higienizacao do ar-condicionado', basePrice: 175.0, estimatedMinutes: 75 },
  { name: 'Troca de embreagem', basePrice: 1450.0, estimatedMinutes: 360 },
  { name: 'Revisao de suspensao', basePrice: 540.0, estimatedMinutes: 180 },
  { name: 'Troca de bateria', basePrice: 95.0, estimatedMinutes: 30 },
  { name: 'Polimento e cristalizacao', basePrice: 680.0, estimatedMinutes: 300 },
];

const PARTS = [
  { name: 'Filtro de oleo', sku: 'FLT-OL-001', unitPrice: 38.9, stockQuantity: 120 },
  { name: 'Oleo sintetico 5W30 (litro)', sku: 'OLE-5W30-1L', unitPrice: 52.4, stockQuantity: 200 },
  { name: 'Pastilha de freio dianteira', sku: 'FRE-PD-204', unitPrice: 186.0, stockQuantity: 45 },
  { name: 'Disco de freio ventilado', sku: 'FRE-DV-311', unitPrice: 274.5, stockQuantity: 28 },
  { name: 'Correia dentada', sku: 'COR-DT-517', unitPrice: 219.9, stockQuantity: 16 },
  { name: 'Filtro de ar do motor', sku: 'FLT-AR-088', unitPrice: 64.3, stockQuantity: 90 },
  { name: 'Filtro de cabine', sku: 'FLT-CB-042', unitPrice: 71.8, stockQuantity: 74 },
  { name: 'Bateria 60Ah', sku: 'BAT-60A-009', unitPrice: 549.0, stockQuantity: 12 },
  { name: 'Amortecedor dianteiro', sku: 'SUS-AM-620', unitPrice: 412.7, stockQuantity: 8 },
  { name: 'Kit de embreagem', sku: 'EMB-KIT-733', unitPrice: 1180.0, stockQuantity: 4 },
  { name: 'Vela de ignicao', sku: 'IGN-VL-115', unitPrice: 43.2, stockQuantity: 150 },
  { name: 'Gas refrigerante R134a', sku: 'ARC-R134-01', unitPrice: 128.0, stockQuantity: 3 },
];

/** Cada linha vira uma OS parada no status alvo. */
const ORDERS: {
  client: number;
  vehicle: number;
  description: string;
  services: number[];
  parts: number[];
  target: string;
}[] = [
  {
    client: 0,
    vehicle: 0,
    description: 'Revisao de 40 mil km',
    services: [0, 1],
    parts: [0, 1],
    target: 'EM_EXECUCAO',
  },
  {
    client: 1,
    vehicle: 1,
    description: 'Barulho ao frear em baixa velocidade',
    services: [2],
    parts: [2, 3],
    target: 'EM_EXECUCAO',
  },
  {
    client: 2,
    vehicle: 2,
    description: 'Troca de correia e tensor',
    services: [3],
    parts: [4],
    target: 'EM_EXECUCAO',
  },
  {
    client: 3,
    vehicle: 3,
    description: 'Ar-condicionado sem gelar',
    services: [5],
    parts: [11],
    target: 'AGUARDANDO_APROVACAO',
  },
  {
    client: 4,
    vehicle: 4,
    description: 'Luz de injecao acesa no painel',
    services: [4],
    parts: [10],
    target: 'AGUARDANDO_APROVACAO',
  },
  {
    client: 5,
    vehicle: 5,
    description: 'Suspensao batendo em lombada',
    services: [7],
    parts: [8],
    target: 'AGUARDANDO_APROVACAO',
  },
  {
    client: 6,
    vehicle: 6,
    description: 'Veiculo nao liga pela manha',
    services: [],
    parts: [],
    target: 'EM_DIAGNOSTICO',
  },
  {
    client: 7,
    vehicle: 7,
    description: 'Revisao preventiva anual',
    services: [],
    parts: [],
    target: 'EM_DIAGNOSTICO',
  },
  {
    client: 0,
    vehicle: 8,
    description: 'Troca de oleo simples',
    services: [],
    parts: [],
    target: 'RECEBIDA',
  },
  {
    client: 1,
    vehicle: 9,
    description: 'Vistoria para transferencia',
    services: [],
    parts: [],
    target: 'RECEBIDA',
  },
  {
    client: 2,
    vehicle: 0,
    description: 'Embreagem patinando em subida',
    services: [6],
    parts: [9],
    target: 'PAUSADO',
  },
  {
    client: 3,
    vehicle: 1,
    description: 'Troca de bateria e checagem eletrica',
    services: [8],
    parts: [7],
    target: 'FINALIZADA',
  },
  {
    client: 4,
    vehicle: 2,
    description: 'Alinhamento apos troca de pneus',
    services: [1],
    parts: [],
    target: 'ENTREGUE',
  },
  {
    client: 5,
    vehicle: 3,
    description: 'Polimento — cliente recusou o orcamento',
    services: [9],
    parts: [],
    target: 'ENCERRADA_SEM_EXECUCAO',
  },
];

/**
 * O caminho ate cada status alvo. A OS nasce em AGUARDANDO_APROVACAO quando tem
 * itens, e em RECEBIDA quando nao tem — por isso as duas trilhas.
 */
const PATH_FROM_RECEBIDA: Record<string, string[]> = {
  RECEBIDA: [],
  EM_DIAGNOSTICO: ['EM_DIAGNOSTICO'],
};

const PATH_FROM_AGUARDANDO: Record<string, string[]> = {
  AGUARDANDO_APROVACAO: [],
  EM_EXECUCAO: ['EM_EXECUCAO'],
  PAUSADO: ['EM_EXECUCAO', 'PAUSADO'],
  FINALIZADA: ['EM_EXECUCAO', 'FINALIZADA'],
  ENTREGUE: ['EM_EXECUCAO', 'FINALIZADA', 'ENTREGUE'],
  // Vazio de proposito: `RefuseBudgetUseCase` ja move a OS para
  // ENCERRADA_SEM_EXECUCAO. Um PATCH depois disso responde 400 com
  // "cannot move from 'ENCERRADA_SEM_EXECUCAO' to 'ENCERRADA_SEM_EXECUCAO'".
  ENCERRADA_SEM_EXECUCAO: [],
};

async function main(): Promise<void> {
  process.stdout.write(`Semeando ${API}\n\n`);

  const login = await call<{ access_token: string }>(
    'POST',
    '/auth/login',
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    'none',
  );
  token = login.access_token;
  process.stdout.write('  autenticado\n');

  const existing = await call<unknown[]>('GET', '/clients');
  if (Array.isArray(existing) && existing.length > 0 && !FORCE) {
    process.stdout.write(
      `\n  Ja existem ${existing.length} clientes na base.\n` +
        '  O seed nao roda duas vezes para nao esbarrar em CPF e placa duplicados.\n' +
        '  Para semear mesmo assim: SEED_FORCE=1 npm run seed:demo\n',
    );
    return;
  }

  const clientIds: string[] = [];
  for (const c of CLIENTS) {
    const first = c.name.split(' ')[0].toLowerCase();
    const created = await call<Id>('POST', '/clients', {
      name: c.name,
      cpfCnpj: cpf(c.base),
      email: `${first}@email.com`,
      phone: c.phone,
    });
    clientIds.push(created.id);
  }
  process.stdout.write(`  ${clientIds.length} clientes\n`);

  const vehicleIds: string[] = [];
  for (let i = 0; i < VEHICLES.length; i++) {
    const created = await call<Id>('POST', '/vehicles', {
      ...VEHICLES[i],
      ownerClientId: clientIds[i % clientIds.length],
    });
    vehicleIds.push(created.id);
  }
  process.stdout.write(`  ${vehicleIds.length} veiculos\n`);

  const serviceIds: string[] = [];
  for (const s of SERVICES) {
    serviceIds.push((await call<Id>('POST', '/services', s)).id);
  }
  process.stdout.write(`  ${serviceIds.length} servicos no catalogo\n`);

  const partIds: string[] = [];
  for (const p of PARTS) {
    partIds.push((await call<Id>('POST', '/parts', p)).id);
  }
  process.stdout.write(`  ${partIds.length} pecas no catalogo\n\n`);

  const tally: Record<string, number> = {};

  for (const o of ORDERS) {
    const hasItems = o.services.length > 0 || o.parts.length > 0;

    const os = await call<{ id: string; status: string; createdBudgetId: string | null }>(
      'POST',
      '/service-orders',
      {
        clientId: clientIds[o.client],
        vehicleId: vehicleIds[o.vehicle],
        description: o.description,
        ...(hasItems
          ? {
              services: o.services.map((i) => ({ referenceId: serviceIds[i], quantity: 1 })),
              parts: o.parts.map((i) => ({ referenceId: partIds[i], quantity: 2 })),
            }
          : {}),
      },
    );

    const steps = hasItems ? PATH_FROM_AGUARDANDO[o.target] : PATH_FROM_RECEBIDA[o.target];
    if (!steps) {
      throw new SeedError(
        `Status alvo "${o.target}" nao e alcancavel a partir de "${os.status}" — revise ORDERS.`,
      );
    }

    // EM_EXECUCAO exige orcamento aprovado. A aprovacao vai pelo canal externo
    // de proposito: e o requisito novo da Fase 2, e da baixa no estoque de
    // verdade, deixando os numeros do catalogo coerentes com as OS criadas.
    if (steps.includes('EM_EXECUCAO') && os.createdBudgetId) {
      await call('POST', `/webhooks/budgets/${os.createdBudgetId}/approve`, undefined, 'webhook');
    }
    if (o.target === 'ENCERRADA_SEM_EXECUCAO' && os.createdBudgetId) {
      await call('POST', `/webhooks/budgets/${os.createdBudgetId}/refuse`, undefined, 'webhook');
    }

    for (const status of steps) {
      await call('PATCH', `/service-orders/${os.id}/status`, {
        status,
        changedBy: ADMIN_EMAIL,
      });
    }

    tally[o.target] = (tally[o.target] ?? 0) + 1;
  }

  process.stdout.write(`  ${ORDERS.length} ordens de servico:\n`);
  for (const [status, n] of Object.entries(tally).sort()) {
    process.stdout.write(`    ${String(n).padStart(2)}  ${status}\n`);
  }

  const ativas = await call<unknown[]>('GET', '/service-orders');
  process.stdout.write(
    `\n  GET /service-orders retorna ${Array.isArray(ativas) ? ativas.length : '?'} OS ativas ` +
      '(as terminais ficam de fora, por prioridade de status).\n',
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\nFalhou: ${msg}\n`);
  if (msg.includes('401')) {
    process.stderr.write(
      'Dica: 401 no login costuma significar que nenhum administrador foi semeado.\n' +
        'Confira ADMIN_EMAIL/ADMIN_PASSWORD e as variaveis ADMIN_BOOTSTRAP_* do ambiente.\n',
    );
  }
  if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
    process.stderr.write(
      `Dica: a API nao respondeu em ${API}. Suba o ambiente ou ajuste API_URL.\n`,
    );
  }
  process.exitCode = 1;
});
