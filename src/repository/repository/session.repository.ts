import { AbstractRepository } from '../../repository/abstract.repository';
import { SessionType, TableNameType } from '../../repository/types/types';

export class SessionRepository extends AbstractRepository {
  private tableName: TableNameType = 'trade_session';

  constructor(_dbName: string) {
    super(_dbName);
  }

  async startSession(configId: number): Promise<string> {
    const indexSession = this._generateIndexOperation();
    await this._insertQuery({
      tableName: this.tableName,
      value: [
        { column: 'index_session', value: indexSession },
        { column: 'config_id', value: configId },
      ],
    });

    return indexSession;
  }

  async getAllSession(): Promise<SessionType[]> {
    const result = await this._selectQuery<SessionType>({
      tableName: this.tableName,
      column: ['index_session as "indexSession"', 'profit_session as "profitSession"', 'config_id as "configId"'],
    });

    if (!result) {
      throw new Error('Not sessions data');
    }

    return result;
  }

  async getAllNotActiveSession(): Promise<SessionType[]> {
    const result = await this._selectQuery<SessionType>({
      tableName: this.tableName,
      column: ['index_session as "indexSession"', 'profit_session as "profitSession"', 'config_id as "configId"'],
      where: [{ column: 'is_active', value: 0 }],
    });

    if (!result) {
      throw new Error('Not sessions data');
    }

    return result;
  }

  async checkingActiveSession(configId: number): Promise<SessionType> {
    const indexSession: SessionType[] | undefined = await this._selectQuery<SessionType>({
      tableName: this.tableName,
      column: ['index_session as "indexSession"', 'is_active as "isActive"'],
      where: [
        { column: 'is_active', value: 1 },
        { column: 'config_id', value: configId },
      ],
      operationCondition: 'and',
    });

    return indexSession && indexSession.length ? indexSession[0] : ({} as SessionType);
  }

  async endTradeSession(profitSession: number, indexSession: string): Promise<void> {
    await this._updateQuery({
      tableName: this.tableName,
      value: [
        { column: 'is_active', value: 0 },
        { column: 'profit_session', value: profitSession },
      ],
      where: [{ column: 'index_session', value: indexSession }],
    });
  }

  async getAllProfitSession(): Promise<number> {
    const result = await this._selectQuery<{ sum: number }>({
      tableName: this.tableName,
      column: ['sum(profit_session)'],
    });

    if (!result) {
      throw new Error('Not sessions data');
    }

    return result[0].sum;
  }

  /**
   * @description This method generates a process id to index an instance of the multiplier
   * @param length - length id. Default value = 45
   * @returns {string} string as id
   */
  private _generateIndexOperation(length = 45): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
