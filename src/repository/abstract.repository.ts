import { DatabaseService } from '../utils/DatabaseService/DatabaseService';
import {
  BalanceStateType,
  ColumnName,
  ConfigType,
  CreateOrderParamsType,
  CreateStateBalanceParamType,
  InsertQueryParamType,
  InstanceIdentityType,
  JoinTableType,
  SelectQueryParamType,
  SessionType,
  UpdateQueryParamType,
  ValueGenerationParamType,
  ValueType,
  WhereGenerationParamType,
} from './types/types';
import { EncryptionService } from '../plugins/EncryptionService/EncryptionService';
import { ENV } from '../plugins/Environment/const';

export abstract class AbstractRepository extends DatabaseService {
  protected _encryptionService: EncryptionService;

  constructor(_dbName: string) {
    super(_dbName);
    this._encryptionService = new EncryptionService();
  }

  protected async _query<T>(query: string, params: unknown[] = []) {
    const result = (await this.query<T>(query, params)) as T[];

    if (!result) {
      return;
    }
    return result;
  }

  protected async _insertQuery({ tableName, value }: InsertQueryParamType) {
    if (!value.length) throw new Error('Insert values cannot be empty.');
    const params = value.map((item) => this._serializeValue(item.value));
    await this._query(
      `
        insert into ${tableName}(${this._insertColumnGeneration(value)})
            values(${this._placeholders(value.length)}) returning *
        `,
      params,
    );
  }

  protected async _updateQuery({ tableName, value, where, operationCondition }: UpdateQueryParamType) {
    if (!value.length) throw new Error('Update values cannot be empty.');
    const params = value.map((item) => this._serializeValue(item.value));
    const whereResult = this._whereChecker({ where, operationCondition }, params.length);

    await this._query(
      `
        update ${tableName} 
          set ${this._updateValueGeneration(value)}
          ${whereResult.sql} returning *
        `,
      [...params, ...whereResult.params],
    );
  }

  protected async _selectQuery<T>({
    tableName,
    column,
    where,
    operationCondition,
    join,
    orderBy,
    limit,
  }: SelectQueryParamType): Promise<T[] | undefined> {
    const joinString = this._joinChecker(join, tableName);
    const whereResult = this._whereChecker({ where, operationCondition });

    const result = await this._query<T>(
      `
      select ${this._selectColumnGeneration(column)}
      from ${tableName}
      ${joinString + ' ' + whereResult.sql}
      ${orderBy ? `order by ${orderBy.column} ${orderBy.type}` : ''}
      ${limit ? `limit ${limit}` : ''}
      `,
      whereResult.params,
    );

    return result;
  }

  protected _mappingValuesList(
    values:
      | BalanceStateType
      | CreateStateBalanceParamType
      | CreateOrderParamsType
      | SessionType
      | Partial<InstanceIdentityType>
      | Partial<ConfigType>,
  ) {
    return Object.keys(values).flatMap((name) => ({
      column: ColumnName[name],
      value: values[name],
    }));
  }

  private _updateValueGeneration(value: ValueGenerationParamType[]) {
    return value.map((val, index) => `${val.column} = ${this._placeholder(index + 1)}`).join(', ');
  }

  private _whereGeneration(param: WhereGenerationParamType, offset = 0) {
    if (!param.where) {
      return ``;
    }

    return param.where
      .map((condition, index) => `${condition.column} = ${this._placeholder(offset + index + 1)}`)
      .join(` ${param.operationCondition ?? ''} `);
  }

  private _whereChecker({ where, operationCondition }: WhereGenerationParamType, offset = 0) {
    if (!where) {
      return { sql: '', params: [] as unknown[] };
    }

    return {
      sql: `where ${this._whereGeneration({ where, operationCondition }, offset)}`,
      params: where.map((condition) => this._serializeValue(condition.value)),
    };
  }

  private _joinChecker(join: JoinTableType[] | undefined, tableName: string) {
    if (!join) {
      return ``;
    }

    return join
      .flatMap(
        (property: JoinTableType) =>
          `${property.joinType} join ${property.joinTable} on ${tableName}.${property.conditionEqual[0]} = ${property.joinTable}.${property.conditionEqual[1]}`,
      )
      .join();
  }

  private _selectColumnGeneration(columns: string[]) {
    return columns.length > 1 ? columns.join(', ') : columns[0];
  }

  private _insertColumnGeneration(value: ValueType[]) {
    return value.flatMap((item) => item.column).join(', ');
  }

  private _placeholders(count: number): string {
    return Array.from({ length: count }, (_, index) => this._placeholder(index + 1)).join(', ');
  }

  private _placeholder(index: number): string {
    return ENV.APP_MODE === 'web' ? `$${index}` : '?';
  }

  private _serializeValue(value: unknown): unknown {
    return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
  }
}
