#!/usr/bin/env bash
# Jornada ponta a ponta pelo gateway (Kong) de um ambiente, do jeito que um
# cliente de verdade chega: porta do host -> Kong -> app / funcao de CPF -> banco.
#
#   ADMIN_PASSWORD=... scripts/e2e-gateway.sh [hml|prd]
#
# Variaveis:
#   ADMIN_PASSWORD  obrigatoria: a ADMIN_BOOTSTRAP_PASSWORD do ambiente
#   ADMIN_EMAIL     padrao admin@oficina.com
#   GATEWAY_URL     padrao http://127.0.0.1:18081 (hml) ou :18080 (prd)
#
# Cria dados novos a cada execucao (CPF e placa aleatorios) e termina com o
# cliente inativado. Sai com codigo != 0 no primeiro passo que divergir.
set -euo pipefail

env_name="${1:-hml}"
case "${env_name}" in
  hml) default_url="http://127.0.0.1:18081" ;;
  prd) default_url="http://127.0.0.1:18080" ;;
  *) echo "uso: $0 [hml|prd]" >&2; exit 2 ;;
esac
base="${GATEWAY_URL:-${default_url}}"
admin_email="${ADMIN_EMAIL:-admin@oficina.com}"
: "${ADMIN_PASSWORD:?defina ADMIN_PASSWORD com a senha do admin do ambiente}"
command -v jq >/dev/null || { echo "jq e necessario" >&2; exit 2; }

body="$(mktemp)"
trap 'rm -f "${body}"' EXIT
step=0

# call METODO CAMINHO STATUS_ESPERADO [TOKEN] [JSON]
call() {
  local method="$1" path="$2" expected="$3" token="${4:-}" data="${5:-}"
  local args=(-s -o "${body}" -w '%{http_code}' -X "${method}" "${base}${path}")
  [ -n "${token}" ] && args+=(-H "Authorization: Bearer ${token}")
  [ -n "${data}" ] && args+=(-H 'Content-Type: application/json' -d "${data}")
  step=$((step + 1))
  local code
  code="$(curl "${args[@]}")"
  if [ "${code}" != "${expected}" ]; then
    printf '%2d. FALHOU  %-6s %-40s esperado %s, veio %s\n' "${step}" "${method}" "${path}" "${expected}" "${code}"
    head -c 500 "${body}"; echo
    exit 1
  fi
  printf '%2d. ok      %-6s %-40s %s\n' "${step}" "${method}" "${path}" "${code}"
}

field() { jq -r "$1" "${body}"; }

# CPF valido (digitos verificadores), nunca com os 11 digitos iguais.
random_cpf() {
  local d=() i sum r
  for i in 0 1 2 3 4 5 6 7 8; do d[i]=$((RANDOM % 10)); done
  d[0]=$(( (d[0] % 9) + 1 )); d[1]=$(( (d[0] + 1) % 10 ))
  for pos in 9 10; do
    sum=0
    for ((i = 0; i < pos; i++)); do sum=$((sum + d[i] * (pos + 1 - i))); done
    r=$(( (sum * 10) % 11 )); [ "${r}" -eq 10 ] && r=0
    d[pos]=${r}
  done
  printf '%s' "${d[@]}"
}

random_plate() {
  local letters=ABCDEFGHIJKLMNOPQRSTUVWXYZ
  printf '%s%s%s%d%s%02d' "${letters:RANDOM%26:1}" "${letters:RANDOM%26:1}" "${letters:RANDOM%26:1}" \
    $((RANDOM % 10)) "${letters:RANDOM%26:1}" $((RANDOM % 100))
}

echo "Gateway ${env_name}: ${base}"
echo

echo "-- borda"
call GET /health 200
call GET /rota-que-nao-existe 404
call GET /clients 401

echo "-- admin"
call POST /auth/login 200 "" "$(jq -nc --arg e "${admin_email}" --arg p "${ADMIN_PASSWORD}" '{email:$e,password:$p}')"
admin_token="$(field .access_token)"

cpf="$(random_cpf)"
call POST /clients 201 "${admin_token}" "$(jq -nc --arg c "${cpf}" '{name:"Cliente E2E",cpfCnpj:$c,email:"e2e@example.com"}')"
client_id="$(field .id)"

plate="$(random_plate)"
call POST /vehicles 201 "${admin_token}" "$(jq -nc --arg p "${plate}" --arg o "${client_id}" '{plate:$p,brand:"Fiat",model:"Uno",year:2015,ownerClientId:$o}')"
vehicle_id="$(field .id)"

call POST /service-orders 201 "${admin_token}" "$(jq -nc --arg c "${client_id}" --arg v "${vehicle_id}" '{clientId:$c,vehicleId:$v,description:"Revisao E2E"}')"
order_id="$(field .id)"

echo "-- cliente (token pela funcao de CPF)"
call POST /auth/cpf 400 "" '{"cpf":"123"}'
call POST /auth/cpf 401 "" '{"cpf":"52998224725"}'
call POST /auth/cpf 200 "" "$(jq -nc --arg c "${cpf}" '{cpf:$c}')"
client_token="$(field .access_token)"

call GET /me/vehicles 200 "${client_token}"
[ "$(jq -r --arg v "${vehicle_id}" '[.[] | select(.id == $v)] | length' "${body}")" = 1 ] \
  || { echo "    /me/vehicles nao trouxe o veiculo ${vehicle_id}"; exit 1; }
call GET /me/service-orders 200 "${client_token}"
[ "$(jq -r --arg o "${order_id}" '[.[] | select(.id == $o)] | length' "${body}")" = 1 ] \
  || { echo "    /me/service-orders nao trouxe a OS ${order_id}"; exit 1; }
call GET /clients 403 "${client_token}"

echo "-- integracao"
call POST "/webhooks/service-orders/${order_id}/status" 401 "segredo-errado" '{"status":"EM_DIAGNOSTICO","changedBy":"e2e"}'

echo "-- cliente inativo"
call PATCH "/clients/${client_id}/status" 200 "${admin_token}" '{"status":"INATIVO"}'
call POST /auth/cpf 401 "" "$(jq -nc --arg c "${cpf}" '{cpf:$c}')"
call GET /me/vehicles 403 "${client_token}"

echo
echo "E2E ${env_name}: ${step} passos ok (cliente ${client_id}, OS ${order_id})"
