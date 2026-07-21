import { optionalEnvConfig } from '../../plugins/Environment/environment';

export type BillingConfig = { shopId: string; secretKey: string; returnUrl: string; planName: string; priceKopecks: number; sendReceipt: boolean; vatCode: number;
  gracePeriodDays:number;retryScheduleHours:number[];reconciliationMinutes:number };
const integer=(name:string,fallback:number,min:number,max:number)=>{const value=Number(optionalEnvConfig(name)??fallback);if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} must be between ${min} and ${max}.`);return value;};

export function getBillingConfig(): BillingConfig {
  const shopId = optionalEnvConfig('YOOKASSA_SHOP_ID');
  const secretKey = optionalEnvConfig('YOOKASSA_SECRET_KEY');
  const returnUrl = optionalEnvConfig('YOOKASSA_RETURN_URL');
  if (!shopId || !secretKey || !returnUrl) throw new Error('YooKassa billing is not configured.');
  const parsedUrl = new URL(returnUrl);
  if (parsedUrl.protocol !== 'https:' && optionalEnvConfig('ENV_RELEASE') !== 'dev') throw new Error('YOOKASSA_RETURN_URL must use HTTPS.');
  const priceKopecks = Number(optionalEnvConfig('PRO_PRICE_KOPECKS'));
  if (!Number.isSafeInteger(priceKopecks) || priceKopecks <= 0) throw new Error('PRO_PRICE_KOPECKS must be a positive integer.');
  const vatCode = Number(optionalEnvConfig('YOOKASSA_VAT_CODE') ?? 1);
  if (!Number.isInteger(vatCode) || vatCode < 1 || vatCode > 6) throw new Error('YOOKASSA_VAT_CODE must be between 1 and 6.');
  const gracePeriodDays=integer('BILLING_GRACE_PERIOD_DAYS',7,1,30);const retryScheduleHours=(optionalEnvConfig('BILLING_RETRY_SCHEDULE_HOURS')??'1,24,72,120').split(',').map(Number);
  if(!retryScheduleHours.length||retryScheduleHours.length>10||retryScheduleHours.some((value,index)=>!Number.isInteger(value)||value<1||value>gracePeriodDays*24||index>0&&value<=retryScheduleHours[index-1]))throw new Error('BILLING_RETRY_SCHEDULE_HOURS must be a strictly increasing list within the grace period.');
  return { shopId, secretKey, returnUrl, planName: optionalEnvConfig('PRO_PLAN_NAME') ?? 'Tonatiuh Pro', priceKopecks,
    sendReceipt: optionalEnvConfig('YOOKASSA_SEND_RECEIPT') === 'true', vatCode,gracePeriodDays,retryScheduleHours,reconciliationMinutes:integer('BILLING_RECONCILIATION_MINUTES',10,1,1440) };
}
