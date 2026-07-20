import { BalanceStateType, CreateStateBalanceParamType, TableNameType } from 'repository/types/types';
import { AbstractRepository } from '../abstract.repository';
import { DatabaseService } from '../../utils/DatabaseService/DatabaseService';

export class BalanceRepository extends AbstractRepository {
  private _tableName: TableNameType;
  private _columns: string[];

  constructor(_dbName: string) {
    super(_dbName);
    this._tableName = 'balance_history';

    this._columns = [
      'usdt',
      'profit_all as "profitAll"',
      'exchange_name as "exchangeName"',
      'profit_usdt as profitUsdt',
      'balance_object as "balanceObject"',
    ];
  }

  async createStateBalance(balanceState: CreateStateBalanceParamType) {
    try {
      await this._insertQuery({
        tableName: this._tableName,
        value: this._mappingValuesList(balanceState),
      });

      return {
        message: 'Balance success was be created!',
      };
    } catch (error) {
      console.error(error);
    }
  }

  async getBalance() {
    const result = await this._selectQuery<BalanceStateType>({
      tableName: this._tableName,
      column: this._columns,
      orderBy: {
        column: 'update_date',
        type: 'desc',
      },
      limit: 1,
    });
    console.log('result balance => ', result);
    return result ? result[0] : undefined;
  }

  async getAllBalance() {
    const result = await this._selectQuery<BalanceStateType>({
      tableName: this._tableName,
      column: this._columns,
    });

    return result ? result : undefined;
  }

  async updateBalance(balance: BalanceStateType) {
    await this._updateQuery({
      tableName: this._tableName,
      value: this._mappingValuesList(balance),
    });
  }
}
