# Versao exata do Node (nao `node:20-alpine`) para builds reproduzives: a tag
# flutuante muda de patch sem aviso e pode quebrar o deploy entre dois builds
# do mesmo commit. Alinhada ao Node 20 usado no CI e no README.
ARG NODE_IMAGE=node:20.20.2-alpine

# Stage 1: Build
FROM ${NODE_IMAGE} AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production
FROM ${NODE_IMAGE} AS runner

WORKDIR /app

# tini como PID 1: encaminha SIGTERM para o processo Node e faz reap de
# processos zumbis. Sem isso o Node roda como PID 1, ignora o sinal e o
# container so morre no SIGKILL do timeout — o que causa downtime e conexoes
# derrubadas em rolling update no Kubernetes.
RUN apk add --no-cache tini

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER nestjs

EXPOSE 3000

# wget faz parte do busybox da imagem alpine — nao ha dependencia extra.
# start-period cobre o boot do Nest + migrations em producao.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/main"]
