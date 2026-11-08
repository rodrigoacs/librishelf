// Espelham as regras do backend (services/authService.js → USERNAME_PATTERN);
// o backend continua sendo quem decide. Usadas no cadastro e na Conta.
export const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
