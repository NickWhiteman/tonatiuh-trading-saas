import { Order } from 'ccxt';
import { CreateOrderParamsType, OrderType, TableNameType } from '../types/types';
import { AbstractRepository } from '../abstract.repository';

export class OrderRepository extends AbstractRepository {
  private _tableName: TableNameType = 'trade_operation';

  constructor(_dbName: string) {
    super(_dbName);
  }

  async getProfitForTradeSession(
    indexSession: string,
    sideCloseOrder: 'sell' | 'buy',
    order: Order[],
  ): Promise<number> {
    // if close buy position: sum(amount) * priceCloseOrder - sum(price * amount)
    // if close sell position: sum(price * amount) - sum(amount) * priceCloseOrder
    const priceResult = await this._selectQuery<{ price: number }>({
      tableName: this._tableName,
      column: ['price'],
      where: [
        { column: 'index_operation', value: indexSession },
        { column: 'order_id', value: order[order.length - 1].id },
      ],
      operationCondition: 'and',
    });

    if (!priceResult?.length) {
      throw new Error('Not found closed order!');
    }

    const { price } = priceResult[0];
    const result = await this._selectQuery<{ sum: number }>({
      tableName: this._tableName,
      column: [
        sideCloseOrder === 'sell'
          ? `sum(amount) * ${price} - sum(price * amount) as "sum"`
          : `sum(price * amount) - sum(amount) * ${price} as "sum"`,
      ],
      where: [
        { column: 'index_operation', value: indexSession },
        { column: 'is_active', value: 1 },
      ],
      operationCondition: 'and',
    });

    console.log('getProfitForTradeSession result[0] => ', result![0]);

    return result ? result[0].sum : 0;
  }

  async getAllActiveOrders(): Promise<OrderType[] | undefined> {
    const result = await this._selectQuery<OrderType>({
      tableName: this._tableName,
      column: ['id', '"order"', 'price', 'amount', 'side', 'symbol', 'order_id as "orderId"'],
      where: [
        { column: 'is_delete', value: 0 },
        { column: 'is_active', value: 1 },
      ],
      operationCondition: 'and',
    });

    if (!result) {
      throw new Error('Active orders not found!');
    }

    return result;
  }

  async getAllOrdersByIndexOperation(indexOperation: string): Promise<OrderType[] | undefined> {
    const result = await this._selectQuery<OrderType>({
      tableName: this._tableName,
      column: ['id', '"order"', 'price', 'amount', 'side', 'symbol', 'order_id as "orderId"'],
      where: [
        { column: 'is_delete', value: 0 },
        // { column: 'is_active', value: 1 },
        { column: 'index_operation', value: indexOperation },
      ],
      operationCondition: 'and',
    });

    if (!result) {
      throw new Error('Active orders not found!');
    }

    return result;
  }

  async findOrderById(orderId: string): Promise<OrderType | undefined> {
    try {
      const result = await this._selectQuery<OrderType>({
        tableName: this._tableName,
        column: [
          'id',
          'order_id as "orderId"',
          '"order"',
          'create_at as "createAt"',
          'amount',
          'price',
          'side',
          'symbol',
          'is_active as "isActive"',
        ],
        where: [{ column: 'order_id', value: orderId }],
      });

      if (!result) {
        throw new Error('Not found order!');
      }

      return result[0];
    } catch (error) {
      console.error(error);
    }
  }

  async createOrder(operation: CreateOrderParamsType): Promise<{ message: string } | undefined> {
    try {
      await this._insertQuery({
        tableName: this._tableName,
        value: this._mappingValuesList(operation),
      });

      return {
        message: 'Order success was be created!',
      };
    } catch (error) {
      console.error(error);
    }
  }

  async deleteOrderById(orderId: string): Promise<{ message: string } | undefined> {
    try {
      await this._updateQuery({
        tableName: this._tableName,
        value: [{ column: 'is_delete', value: 1 }],
        where: [{ column: 'order_id', value: orderId }],
      });

      return {
        message: 'Order was be deleted!',
      };
    } catch (error) {
      console.error(error);
    }
  }

  async revertOrderActiveStatus(indexOperation: string): Promise<void> {
    try {
      await this._updateQuery({
        tableName: this._tableName,
        value: [{ column: 'is_active', value: 0 }],
        where: [{ column: 'index_operation', value: indexOperation }],
      });
    } catch (error) {
      console.error(error);
    }
  }
}
