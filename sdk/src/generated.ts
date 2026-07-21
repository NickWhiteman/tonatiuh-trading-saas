/* Generated from docs/openapi.yaml. Do not edit manually. */

export type ErrorResponse = { error: { code: string; message: string; requestId: string; details?: unknown; }; };
export type Session = { accessToken: string; refreshToken: string; expiresIn: number; };
export type AssignableRole = "ADMIN" | "TRADER" | "ANALYST" | "BILLING" | "VIEWER";
export type Register = { email: string; password: string; displayName: string; organizationName?: string; acceptTerms: boolean; acceptPrivacy: boolean; };
export type Login = { email: string; password: string; };
export type ExchangeConnectionInput = { exchange: "okx" | "binance" | "bitget" | "kucoin" | "mexc" | "poloniex" | "gate" | "exmo" | "bybit"; label: string; apiKey: string; secret: string; password?: string; sandbox?: boolean; verify?: boolean; };
export type BotInput = { exchangeConnectionId: string; name: string; strategy?: "VECTOR_PROFIT"; configuration: TradingConfiguration; };
export type TradingConfiguration = { symbol: string; positionSize?: number; countGridSize?: number; gridSize?: number; percentBuyBackStep?: number; takeProfit?: number; stopLoss?: number; percentProfit?: number; percentFromBalance?: number; candlePriceRange?: "1m" | "5m" | "15m" | "1h" | "4h" | "1d"; isFibonacci?: boolean; isPercentTargetAfterTakeProfit?: boolean; isCapitalizeDeltaFromSale?: boolean; isCoinAccumulation?: boolean; isOnlyBuy?: boolean; percentTargetAfterTakeProfit?: number; balanceDistribution?: boolean; };

export interface Operations {
  register: { path: never; query: never; headers: never; body: Register; bodyRequired: true; response: unknown; };
  login: { path: never; query: never; headers: never; body: Login; bodyRequired: true; response: Session; };
  refreshSession: { path: never; query: never; headers: never; body: { refreshToken: string; }; bodyRequired: true; response: Session; };
  logout: { path: never; query: never; headers: never; body: { refreshToken: string; }; bodyRequired: true; response: void; };
  verifyEmail: { path: never; query: never; headers: never; body: { token: string; }; bodyRequired: true; response: unknown; };
  resendVerification: { path: never; query: never; headers: never; body: { email: string; }; bodyRequired: true; response: unknown; };
  forgotPassword: { path: never; query: never; headers: never; body: { email: string; }; bodyRequired: true; response: unknown; };
  resetPassword: { path: never; query: never; headers: never; body: { token: string; password: string; }; bodyRequired: true; response: unknown; };
  cancelAccountDeletion: { path: never; query: never; headers: never; body: Login; bodyRequired: true; response: unknown; };
  currentAccount: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  scheduleAccountDeletion: { path: never; query: never; headers: never; body: { password: string; }; bodyRequired: true; response: unknown; };
  exportAccountData: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  listPlans: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  listOrganizations: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  switchOrganization: { path: never; query: never; headers: never; body: { organizationId: string; }; bodyRequired: true; response: Session; };
  listOrganizationMembers: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  updateMemberRole: { path: { userId: string; }; query: never; headers: never; body: { role: AssignableRole; }; bodyRequired: true; response: unknown; };
  removeMember: { path: { userId: string; }; query: never; headers: never; body: never; bodyRequired: false; response: void; };
  listInvitations: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  createInvitation: { path: never; query: never; headers: never; body: { email: string; role: AssignableRole; }; bodyRequired: true; response: unknown; };
  acceptInvitation: { path: never; query: never; headers: never; body: { token: string; }; bodyRequired: true; response: unknown; };
  revokeInvitation: { path: { id: string; }; query: never; headers: never; body: never; bodyRequired: false; response: void; };
  yookassaWebhook: { path: never; query: never; headers: never; body: Record<string, unknown>; bodyRequired: true; response: unknown; };
  getSubscription: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  getPlanUsage: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  createCheckout: { path: never; query: never; headers: { "Idempotency-Key": string; }; body: never; bodyRequired: false; response: unknown; };
  cancelSubscription: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  resumeSubscription: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  listExchangeConnections: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  createExchangeConnection: { path: never; query: never; headers: never; body: ExchangeConnectionInput; bodyRequired: true; response: unknown; };
  updateExchangeConnection: { path: { id: string; }; query: never; headers: never; body: { label?: string; enabled?: boolean; apiKey?: string; secret?: string; password?: string; }; bodyRequired: true; response: unknown; };
  verifyExchangeConnection: { path: { id: string; }; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  listBots: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  createBot: { path: never; query: never; headers: never; body: BotInput; bodyRequired: true; response: unknown; };
  getBot: { path: { id: string; }; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  updateBot: { path: { id: string; }; query: never; headers: never; body: { name?: string; configuration?: TradingConfiguration; }; bodyRequired: true; response: unknown; };
  startBot: { path: { id: string; }; query: never; headers: { "Idempotency-Key": string; }; body: never; bodyRequired: false; response: unknown; };
  stopBot: { path: { id: string; }; query: never; headers: { "Idempotency-Key": string; }; body: never; bodyRequired: false; response: unknown; };
  restartBot: { path: { id: string; }; query: never; headers: { "Idempotency-Key": string; }; body: never; bodyRequired: false; response: unknown; };
  listBotCommands: { path: { id: string; }; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  listBotOrders: { path: { id: string; }; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  emailProviderEvent: { path: never; query: never; headers: never; body: { eventId: string; messageId: string; type: "DELIVERED" | "HARD_BOUNCE" | "COMPLAINT"; }; bodyRequired: true; response: unknown; };
  liveness: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  adminStats: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  adminListUsers: { path: never; query: { limit?: number; offset?: number; search?: string; }; headers: never; body: never; bodyRequired: false; response: unknown; };
  adminChangeUserStatus: { path: { id: string; }; query: never; headers: never; body: { status: "ACTIVE" | "SUSPENDED"; }; bodyRequired: true; response: unknown; };
  adminRevokeUserSessions: { path: { id: string; }; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  adminListOrganizations: { path: never; query: { limit?: number; offset?: number; search?: string; }; headers: never; body: never; bodyRequired: false; response: unknown; };
  adminChangeOrganizationStatus: { path: { id: string; }; query: never; headers: never; body: { status: "ACTIVE" | "SUSPENDED"; }; bodyRequired: true; response: unknown; };
  adminListAuditEvents: { path: never; query: { limit?: number; offset?: number; }; headers: never; body: never; bodyRequired: false; response: unknown; };
  adminListPayments: { path: never; query: { limit?: number; offset?: number; }; headers: never; body: never; bodyRequired: false; response: unknown; };
  adminSystemStatus: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  adminListEmailDeadLetters: { path: never; query: { limit?: number; offset?: number; }; headers: never; body: never; bodyRequired: false; response: unknown; };
  adminRetryEmailDeadLetter: { path: { id: string; }; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  readiness: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
  prometheusMetrics: { path: never; query: never; headers: never; body: never; bodyRequired: false; response: unknown; };
}
export type OperationId=keyof Operations;
export type RequestOptions<K extends OperationId>={signal?:AbortSignal}&
  ([Operations[K]['path']] extends [never]?{path?:never}:{path:Operations[K]['path']})&
  ([Operations[K]['query']] extends [never]?{query?:never}:{query?:Operations[K]['query']})&
  ([Operations[K]['headers']] extends [never]?{headers?:never}:{headers:Operations[K]['headers']})&
  (Operations[K]['bodyRequired'] extends true?{body:Operations[K]['body']}:[Operations[K]['body']] extends [never]?{body?:never}:{body?:Operations[K]['body']});

export const operations={
  register: {method:"POST",path:"/api/v1/auth/register"},
  login: {method:"POST",path:"/api/v1/auth/login"},
  refreshSession: {method:"POST",path:"/api/v1/auth/refresh"},
  logout: {method:"POST",path:"/api/v1/auth/logout"},
  verifyEmail: {method:"POST",path:"/api/v1/auth/verify-email"},
  resendVerification: {method:"POST",path:"/api/v1/auth/resend-verification"},
  forgotPassword: {method:"POST",path:"/api/v1/auth/forgot-password"},
  resetPassword: {method:"POST",path:"/api/v1/auth/reset-password"},
  cancelAccountDeletion: {method:"POST",path:"/api/v1/auth/cancel-deletion"},
  currentAccount: {method:"GET",path:"/api/v1/auth/me"},
  scheduleAccountDeletion: {method:"DELETE",path:"/api/v1/auth/me"},
  exportAccountData: {method:"GET",path:"/api/v1/auth/me/export"},
  listPlans: {method:"GET",path:"/api/v1/billing/plans"},
  listOrganizations: {method:"GET",path:"/api/v1/organizations"},
  switchOrganization: {method:"POST",path:"/api/v1/organizations/switch"},
  listOrganizationMembers: {method:"GET",path:"/api/v1/organizations/members"},
  updateMemberRole: {method:"PATCH",path:"/api/v1/organizations/members/{userId}"},
  removeMember: {method:"DELETE",path:"/api/v1/organizations/members/{userId}"},
  listInvitations: {method:"GET",path:"/api/v1/organizations/invitations"},
  createInvitation: {method:"POST",path:"/api/v1/organizations/invitations"},
  acceptInvitation: {method:"POST",path:"/api/v1/organizations/invitations/accept"},
  revokeInvitation: {method:"DELETE",path:"/api/v1/organizations/invitations/{id}"},
  yookassaWebhook: {method:"POST",path:"/api/v1/billing/webhook"},
  getSubscription: {method:"GET",path:"/api/v1/billing/subscription"},
  getPlanUsage: {method:"GET",path:"/api/v1/billing/usage"},
  createCheckout: {method:"POST",path:"/api/v1/billing/checkout"},
  cancelSubscription: {method:"POST",path:"/api/v1/billing/cancel"},
  resumeSubscription: {method:"POST",path:"/api/v1/billing/resume"},
  listExchangeConnections: {method:"GET",path:"/api/v1/exchanges"},
  createExchangeConnection: {method:"POST",path:"/api/v1/exchanges"},
  updateExchangeConnection: {method:"PATCH",path:"/api/v1/exchanges/{id}"},
  verifyExchangeConnection: {method:"POST",path:"/api/v1/exchanges/{id}/verify"},
  listBots: {method:"GET",path:"/api/v1/bots"},
  createBot: {method:"POST",path:"/api/v1/bots"},
  getBot: {method:"GET",path:"/api/v1/bots/{id}"},
  updateBot: {method:"PATCH",path:"/api/v1/bots/{id}"},
  startBot: {method:"POST",path:"/api/v1/bots/{id}/start"},
  stopBot: {method:"POST",path:"/api/v1/bots/{id}/stop"},
  restartBot: {method:"POST",path:"/api/v1/bots/{id}/restart"},
  listBotCommands: {method:"GET",path:"/api/v1/bots/{id}/commands"},
  listBotOrders: {method:"GET",path:"/api/v1/bots/{id}/orders"},
  emailProviderEvent: {method:"POST",path:"/api/v1/email/provider-events"},
  liveness: {method:"GET",path:"/health/live"},
  adminStats: {method:"GET",path:"/api/v1/admin/stats"},
  adminListUsers: {method:"GET",path:"/api/v1/admin/users"},
  adminChangeUserStatus: {method:"PATCH",path:"/api/v1/admin/users/{id}/status"},
  adminRevokeUserSessions: {method:"POST",path:"/api/v1/admin/users/{id}/revoke-sessions"},
  adminListOrganizations: {method:"GET",path:"/api/v1/admin/organizations"},
  adminChangeOrganizationStatus: {method:"PATCH",path:"/api/v1/admin/organizations/{id}/status"},
  adminListAuditEvents: {method:"GET",path:"/api/v1/admin/audit-events"},
  adminListPayments: {method:"GET",path:"/api/v1/admin/payments"},
  adminSystemStatus: {method:"GET",path:"/api/v1/admin/system"},
  adminListEmailDeadLetters: {method:"GET",path:"/api/v1/admin/email/dead-letters"},
  adminRetryEmailDeadLetter: {method:"POST",path:"/api/v1/admin/email/dead-letters/{id}/retry"},
  readiness: {method:"GET",path:"/health/ready"},
  prometheusMetrics: {method:"GET",path:"/metrics"}
} as const satisfies Record<OperationId,{method:string;path:string}>;
