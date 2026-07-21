const { expect } = require('chai');
const { describe, it } = require('node:test');
const { getBillingConfig } = require('../build/saas/billing/config');

describe('billing configuration', () => {
  it('accepts an explicit production configuration', () => {
    Object.assign(process.env, {
      ENV_RELEASE: 'prod', YOOKASSA_SHOP_ID: 'shop', YOOKASSA_SECRET_KEY: 'secret',
      YOOKASSA_RETURN_URL: 'https://app.example.com/billing/return', PRO_PRICE_KOPECKS: '99000',
    });
    expect(getBillingConfig()).to.include({ priceKopecks: 99000, returnUrl: 'https://app.example.com/billing/return',gracePeriodDays:7,reconciliationMinutes:10 });
    expect(getBillingConfig().retryScheduleHours).to.deep.equal([1,24,72,120]);
  });

  it('rejects an insecure production return URL', () => {
    process.env.YOOKASSA_RETURN_URL = 'http://app.example.com/billing/return';
    expect(() => getBillingConfig()).to.throw('must use HTTPS');
  });
  it('rejects a non-increasing retry schedule',()=>{process.env.YOOKASSA_RETURN_URL='https://app.example.com/billing/return';process.env.BILLING_RETRY_SCHEDULE_HOURS='24,1';
    try{expect(()=>getBillingConfig()).to.throw('strictly increasing');}finally{delete process.env.BILLING_RETRY_SCHEDULE_HOURS;}});
});
