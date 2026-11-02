# ADR-002: Escalabilidade horizontal com HPA por ambiente

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 2026-10-30 |
| Substitui | o HPA único da Fase 2: `k8s/app-hpa.yaml`, namespace `soat`, 2 a 10 pods |
| Substituída por | — |
| Issue | [#57](https://github.com/gomes-leonardo/fiap-software-architecture/issues/57), [#54](https://github.com/gomes-leonardo/fiap-software-architecture/issues/54), [#63](https://github.com/gomes-leonardo/fiap-software-architecture/issues/63) |

## Contexto

A aplicação é stateless: sessão no token, dados no banco. Mais pods significam mais vazão, e o
gargalo de CPU é o processamento das requisições no Node. O enunciado pede escalabilidade
automática com HPA.

Na Fase 2 havia um único HPA, no namespace `soat`, de 2 a 10 pods. A Fase 3 cria dois ambientes no
mesmo cluster ([ADR-004](ADR-004-ambientes-hml-prd.md)), e homologação não precisa da mesma
capacidade de produção.

## Decisão

Um HPA `autoscaling/v2` na base Kustomize (`k8s/base/hpa.yaml`), com os limites de pods definidos
em cada overlay.

| | hml (`soat-hml`) | prd (`soat-prd`) |
|---|---|---|
| Mínimo de pods | **1** | **2** |
| Máximo de pods | **3** | **10** |
| Métrica | CPU, **70%** da `requests.cpu` | igual |
| `requests.cpu` do container | **250m** (alvo de ~175m por pod) | igual |
| Subida | janela de estabilização **0 s**; até dobrar (100%) a cada 30 s | igual |
| Descida | janela de estabilização **300 s**; até 50% a cada 60 s | igual |

O Deployment não declara `replicas`. Um valor ali seria reaplicado a cada deploy e brigaria com o
HPA. O `metrics-server` é instalado pelo `soat-infra-k8s/cluster`.

Por que esses valores:

- **Mínimo 2 em prd.** Uma réplica cair (deploy, OOM, node) não derruba a API. Com
  `maxUnavailable: 0`, o rolling update nunca fica abaixo do mínimo.
- **Mínimo 1 e máximo 3 em hml.** Homologação valida a versão, não a capacidade. Economiza CPU e
  memória do Mac, que hospeda os dois ambientes.
- **70% de CPU.** Deixa 30% de folga para absorver o pico enquanto o pod novo sobe (boot do Nest e
  conexão com o banco).
- **Subida sem janela, descida com 5 minutos.** Subir cedo demais custa pouco. Descer cedo demais
  causa flapping quando a carga oscila.

## O que foi trocado

| Fase 2 | Fase 3 |
|---|---|
| `k8s/app-hpa.yaml`, com `namespace: soat` fixo | `k8s/base/hpa.yaml`, sem namespace e sem limites |
| 2 a 10 pods, em um ambiente | 1 a 3 em hml, 2 a 10 em prd, por patch de overlay |
| `metrics-server` instalado à mão ou pelo Terraform de `infra/` | instalado pelo `soat-infra-k8s/cluster` |

Métrica, alvo de 70%, requests de 250m e o bloco `behavior` não mudaram.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| **Réplicas fixas** | Paga a capacidade do pico o tempo todo, ou cai no pico |
| **HPA por memória** | O heap do Node não cai depois da carga, então o HPA não desceria |
| **KEDA por taxa de requisições** | Mais preciso para uma API, mas exige um operador a mais e uma fonte de métricas de requisição no cluster. CPU já responde bem para este perfil de carga |
| **VPA** | Ajusta o tamanho do pod, não o número. Conflita com o HPA quando os dois olham CPU |
| **Mesmo HPA nos dois ambientes** | hml ocuparia até 10 pods no Mac sem necessidade |

## Consequências

- **O Kind não escala nós.** O cluster tem um worker fixo. O HPA cria pods até o limite do overlay,
  da ResourceQuota do namespace (`requests.cpu` 4 em prd, 2 em hml) e da CPU real do Mac. Dez pods
  de prd pedem 2,5 CPU, dentro da quota. Num EKS, o Cluster Autoscaler ou o Karpenter
  acrescentariam nós quando os pods ficassem `Pending`.
- **Sem `requests.cpu`, nada escala.** O HPA mede utilização como uso sobre request. O valor está no
  Deployment e não pode sair.
- **O rate limit em memória da aplicação é por pod.** Com N réplicas, o limite efetivo do
  `/consult` e do login é N vezes o configurado. O rate limit do Kong é o que vale na borda.
- A demonstração ao vivo do HPA está documentada na issue
  [#63](https://github.com/gomes-leonardo/fiap-software-architecture/issues/63).

## O que muda se revertermos

Sem HPA, o Deployment volta a declarar `replicas` (2 em prd, 1 em hml) e o arquivo `hpa.yaml` sai da
base. O `metrics-server` deixa de ser pré-requisito. A capacidade passa a ser escolhida à mão, a
cada mudança de carga.
