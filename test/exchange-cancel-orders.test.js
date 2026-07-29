const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { ExchangeService } = require('../build/utils/ExchangeService/ExchangeService');

function serviceWithExchange(exchange) {
  const service = Object.create(ExchangeService.prototype);
  service._ccxt = exchange;
  return service;
}

describe('exchange order cancellation', () => {
  it('uses the exchange bulk cancellation when it is supported', async () => {
    let bulkCalls = 0;
    const service = serviceWithExchange({
      cancelAllOrders: async () => { bulkCalls += 1; },
      fetchOpenOrders: async () => {
        throw new Error('fallback must not run');
      },
    });

    await service.cancelAllOrders('ETH/USDT');

    assert.equal(bulkCalls, 1);
  });

  it('cancels every open order separately when bulk cancellation is unsupported', async () => {
    const cancelled = [];
    let fetchCalls = 0;
    const service = serviceWithExchange({
      cancelAllOrders: async () => {
        throw new Error('okx cancelAllOrders() is not supported');
      },
      fetchOpenOrders: async () => {
        fetchCalls += 1;
        return fetchCalls === 1
          ? [{ id: 'order-1' }, { id: 'order-2' }, { id: 'order-3' }]
          : [];
      },
      cancelOrder: async (id, symbol) => {
        cancelled.push({ id, symbol });
      },
    });

    await service.cancelAllOrders('ETH/USDT');

    assert.deepEqual(cancelled, [
      { id: 'order-1', symbol: 'ETH/USDT' },
      { id: 'order-2', symbol: 'ETH/USDT' },
      { id: 'order-3', symbol: 'ETH/USDT' },
    ]);
  });

  it('does not block position closing when bulk cancellation failed after cancelling all orders', async () => {
    const service = serviceWithExchange({
      cancelAllOrders: async () => {
        throw new Error('bulk request failed');
      },
      fetchOpenOrders: async () => [],
    });

    await assert.doesNotReject(service.cancelAllOrders('ETH/USDT'));
  });

  it('fails safely when individual cancellation leaves an open order', async () => {
    let fetchCalls = 0;
    const service = serviceWithExchange({
      cancelAllOrders: async () => {
        throw new Error('bulk request failed');
      },
      fetchOpenOrders: async () => {
        fetchCalls += 1;
        return [{ id: fetchCalls === 1 ? 'order-1' : 'still-open' }];
      },
      cancelOrder: async () => {
        throw new Error('individual cancellation failed');
      },
    });

    await assert.rejects(
      service.cancelAllOrders('ETH/USDT'),
      /Unable to cancel open orders for ETH\/USDT: still-open/,
    );
  });
});
