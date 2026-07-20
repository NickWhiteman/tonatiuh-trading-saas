import { OrderRepository } from '../../repository/repository/order.repository';

export class OrderService extends OrderRepository {
  constructor(_dbName: string) {
    super(_dbName);
  }
}
