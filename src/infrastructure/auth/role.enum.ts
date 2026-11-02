export enum Role {
  ADMIN = 'admin',
  CLIENT = 'client',
}

/**
 * Emissores aceitos. O segredo e simetrico e compartilhado com a funcao de
 * autenticacao por CPF, entao `iss` diz quem emitiu e o Kong usa o mesmo
 * campo para escolher o consumer.
 */
export const ADMIN_TOKEN_ISSUER = 'soat-app';
export const CLIENT_TOKEN_ISSUER = 'soat-auth-lambda';
