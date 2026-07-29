const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  calculateClosingOrderExposure,
} = require('../build/utils/OrdersOperationService/position-exposure');
const {
  OrdersOperationService,
} = require('../build/utils/OrdersOperationService/OrdersOperationService');

describe('filled position exposure', () => {
  it('closes the full volume of multiple filled long orders', () => {
    assert.deepEqual(calculateClosingOrderExposure([
      { side: 'buy', filled: 0.25 },
      { side: 'buy', filled: 0.5 },
      { side: 'buy', filled: 0.75 },
    ]), { side: 'sell', amount: 1.5 });
  });

  it('closes the full volume of multiple filled short orders', () => {
    assert.deepEqual(calculateClosingOrderExposure([
      { side: 'sell', filled: 1.25 },
      { side: 'sell', filled: 0.75 },
    ]), { side: 'buy', amount: 2 });
  });

  it('subtracts already executed reverse orders from the open position', () => {
    assert.deepEqual(calculateClosingOrderExposure([
      { side: 'buy', filled: 2 },
      { side: 'sell', filled: 0.4 },
      { side: 'sell', filled: 0.1 },
    ]), { side: 'sell', amount: 1.5 });
  });

  it('does not submit another close when reverse orders cover the position', () => {
    assert.equal(calculateClosingOrderExposure([
      { side: 'buy', filled: 1 },
      { side: 'sell', filled: 1 },
    ]), undefined);
  });

  it('ignores unfilled and invalid quantities', () => {
    assert.deepEqual(calculateClosingOrderExposure([
      { side: 'buy', filled: 1 },
      { side: 'sell', filled: 0 },
      { side: 'sell', filled: Number.NaN },
    ]), { side: 'sell', amount: 1 });
  });

  it('submits one reverse order for the entire open filled volume', async () => {
    const submittedOrders = [];
    const service = Object.create(OrdersOperationService.prototype);
    service.orders = [
      { id: 'entry-1', side: 'buy', symbol: 'ETH/USDT', amount: 0.5 },
      { id: 'entry-2', side: 'buy', symbol: 'ETH/USDT', amount: 0.75 },
    ];
    service._ExchangeService = {
      cancelAllOrders: async () => undefined,
      checkStatusOrderById: async (id) => ({
        id,
        symbol: 'ETH/USDT',
        side: 'buy',
        type: 'limit',
        status: 'closed',
        filled: id === 'entry-1' ? 0.5 : 0.75,
        amount: id === 'entry-1' ? 0.5 : 0.75,
      }),
      getPrice: async () => 2000,
      createOrder: async (order) => {
        submittedOrders.push(order);
        return {
          id: 'close-1',
          ...order,
          status: 'closed',
          filled: order.amount,
        };
      },
    };

    const closingOrder = await service.closeFilledPosition('ETH/USDT');

    assert.deepEqual(submittedOrders, [{
      symbol: 'ETH/USDT',
      type: 'limit',
      side: 'sell',
      amount: 1.25,
      price: 2000,
    }]);
    assert.equal(closingOrder.id, 'close-1');
  });
});
