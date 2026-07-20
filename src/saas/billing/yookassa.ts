import { SaasHttpError } from '../http/errors';
import { getBillingConfig } from './config';

export type YooPayment = { id: string; status: 'pending'|'waiting_for_capture'|'succeeded'|'canceled'; paid?: boolean;
  amount: { value: string; currency: string }; confirmation?: { type: string; confirmation_url?: string };
  payment_method?: { id: string; saved?: boolean }; metadata?: Record<string,string> };

async function providerRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getBillingConfig();
  const response = await fetch(`https://api.yookassa.ru/v3${path}`, { ...init, signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Basic ${Buffer.from(`${config.shopId}:${config.secretKey}`).toString('base64')}`,
      'Content-Type': 'application/json', ...init.headers } }).catch((error) => {
        console.error('YooKassa request failed.', error);
        throw new SaasHttpError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Payment provider is unavailable.');
      });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerType = data && typeof data === 'object' && 'type' in data ? data.type : undefined;
    console.error(JSON.stringify({ level: 'error', provider: 'yookassa', status: response.status, providerType }));
    throw new SaasHttpError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider rejected the request.');
  }
  return data as T;
}

const amount = () => (getBillingConfig().priceKopecks / 100).toFixed(2);
function receipt(email: string) { const c=getBillingConfig(); return c.sendReceipt ? { customer:{email}, items:[{description:c.planName,
  quantity:'1.00',amount:{value:amount(),currency:'RUB'},vat_code:c.vatCode,payment_mode:'full_payment',payment_subject:'service'}] } : undefined; }

export function createInitialPayment(input: { organizationId:string; email:string; idempotencyKey:string }): Promise<YooPayment> {
  const config=getBillingConfig();
  return providerRequest('/payments',{method:'POST',headers:{'Idempotence-Key':input.idempotencyKey},body:JSON.stringify({
    amount:{value:amount(),currency:'RUB'},capture:true,confirmation:{type:'redirect',return_url:config.returnUrl},
    description:`${config.planName}: subscription for one month`,save_payment_method:true,
    metadata:{organizationId:input.organizationId,kind:'INITIAL'},receipt:receipt(input.email)})});
}
export function createRecurringPayment(input:{organizationId:string;email:string;paymentMethodId:string;idempotencyKey:string}):Promise<YooPayment>{
  const config=getBillingConfig();
  return providerRequest('/payments',{method:'POST',headers:{'Idempotence-Key':input.idempotencyKey},body:JSON.stringify({
    amount:{value:amount(),currency:'RUB'},capture:true,payment_method_id:input.paymentMethodId,
    description:`${config.planName}: subscription renewal`,metadata:{organizationId:input.organizationId,kind:'RENEWAL'},receipt:receipt(input.email)})});
}
export function getPayment(id:string):Promise<YooPayment>{return providerRequest(`/payments/${encodeURIComponent(id)}`);}
