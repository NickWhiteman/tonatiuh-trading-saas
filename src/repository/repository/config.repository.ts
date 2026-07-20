import { AbstractRepository } from '../abstract.repository';
import { ConfigType, TableNameType } from '../types/types';

export class ConfigRepository extends AbstractRepository {
  private tableName: TableNameType = 'trade_config';
  private _column: string[];
  constructor(_dbName: string) {
    super(_dbName);
    this._column = [
      'trade_config.id',
      'position_size as "positionSize"',
      'count_grid_size as "countGridSize"',
      'grid_size as "gridSize"',
      'percent_buy_back as "percentBuyBackStep"',
      'take_profit as "takeProfit"',
      'stop_loss as "stopLoss"',
      'is_emergency_stop as "isEmergencyStop"',
      'is_fibonacci as "isFibonacci"',
      'percent_profit as "percentProfit"',
      'percent_from_balance as "percentFromBalance"',
      'candle_price_range as "candlePriceRange"',
      'percent_target_after_take_profit as "percentTargetAfterTakeProfit"',
      'is_percent_target_after_take_profit as "isPercentTargetAfterTakeProfit"',
      'is_capitalize_delta_from_sale as "isCapitalizeDeltaFromSale"',
      'is_coin_accumulation as "isCoinAccumulation"',
      'is_auto_start_trading as "isAutoStartTrading"',
      'is_stop_trading as "isStopTrading"',
      'is_only_buy as "isOnlyBuy"',
      'logger_event as "loggerEvent"',
      'api_key as "apiKey"',
      'private_key as "privateKey"',
      'password',
      'exchange',
      'symbol',
    ];
  }

  async getConfig(): Promise<ConfigType[]> {
    const result = await this._selectQuery<ConfigType>({
      tableName: this.tableName,
      column: this._column,
    });

    result &&
      result.flatMap((config) => {
        config.apiKey = this._encryptionService.decrypt(config.apiKey);
        config.privateKey = this._encryptionService.decrypt(config.privateKey);
        config.password = this._encryptionService.decrypt(config.password);
      });

    return result ?? ([] as ConfigType[]);
  }

  async getConfigById(configId: number): Promise<ConfigType> {
    const result = (await this._selectQuery<ConfigType>({
      tableName: this.tableName,
      column: this._column,
      where: [{ column: 'trade_config.id', value: configId }],
    }))![0];

    const config = {
      ...result,
      apiKey: this._encryptionService.decrypt(result.apiKey),
      privateKey: this._encryptionService.decrypt(result.privateKey),
      password: this._encryptionService.decrypt(result.password),
    };

    return config ?? ({} as ConfigType);
  }

  async createConfig(config: ConfigType): Promise<void> {
    const { apiKey, privateKey, password, id, ...configTemp } = config;

    const encryptedConfig = {
      ...configTemp,
      apiKey: this._encryptionService.encrypt(apiKey),
      privateKey: this._encryptionService.encrypt(privateKey),
      password: this._encryptionService.encrypt(password),
    };

    await this._insertQuery({
      tableName: this.tableName,
      value: this._mappingValuesList(encryptedConfig),
    });
  }

  async getEmergencyStop(configId: number): Promise<{ isEmergencyStop: boolean }> {
    const result = await this._selectQuery<{ isEmergencyStop: boolean }>({
      tableName: this.tableName,
      column: ['is_emergency_stop as "isEmergencyStop"'],
      where: [{ column: 'trade_config.id', value: configId }],
    });

    if (!result) {
      throw new Error('Config is not found!');
    }

    return result[0];
  }

  async enableEmergencyStop(configId: number): Promise<void> {
    await this._updateQuery({
      tableName: this.tableName,
      value: [{ column: 'is_emergency_stop', value: 1 }],
      where: [{ column: 'trade_config.id', value: configId }],
    });
  }

  async disableEmergencyStop(): Promise<void> {
    await this._updateQuery({
      tableName: this.tableName,
      value: [{ column: 'is_emergency_stop', value: 0 }],
      where: [{ column: 'is_emergency_stop', value: 1 }],
    });
  }

  async enableStopTrading(configId: number): Promise<void> {
    await this._updateQuery({
      tableName: this.tableName,
      value: [{ column: 'is_stop_trading', value: 1 }],
      where: [{ column: 'trade_config.id', value: configId }],
    });
  }

  async disableStopTrading(configId: number): Promise<void> {
    await this._updateQuery({
      tableName: this.tableName,
      value: [{ column: 'is_stop_trading', value: 0 }],
      where: [
        { column: 'is_stop_trading', value: 1 },
        { column: 'trade_config.id', value: configId },
      ],
      operationCondition: 'and',
    });
  }

  async enabledAutoStartTrading(configId: number): Promise<void> {
    await this._updateQuery({
      tableName: this.tableName,
      value: [{ column: 'is_auto_start_trading', value: 1 }],
      where: [{ column: 'trade_config.id', value: configId }],
    });
  }

  async disableAutoStartTrading(configId: number): Promise<void> {
    await this._updateQuery({
      tableName: this.tableName,
      value: [{ column: 'is_auto_start_trading', value: 0 }],
      where: [{ column: 'trade_config.id', value: configId }],
    });
  }

  async disableConfigUpdate(configId: number): Promise<void> {
    await this._updateQuery({
      tableName: this.tableName,
      value: [{ column: 'is_config_update', value: 0 }],
      where: [{ column: 'trade_config.id', value: configId }],
    });
  }

  async recordLogger(loggerEvent: string, configId: number): Promise<void> {
    await this._updateQuery({
      tableName: this.tableName,
      value: [
        {
          column: 'logger_event',
          value: loggerEvent,
        },
      ],
      where: [{ column: 'trade_config.id', value: configId }],
    });
  }

  async updateConfig(config: Partial<ConfigType>, configId: number) {
    const { apiKey, privateKey, password, ...configTemp } = config;

    const configMapping: { [key: string]: any } = {};

    if (apiKey) {
      configMapping.apiKey = this._encryptionService.encrypt(apiKey);
    }
    if (privateKey) {
      configMapping.privateKey = this._encryptionService.encrypt(privateKey);
    }
    if (password) {
      configMapping.password = this._encryptionService.encrypt(password);
    }
    await this._updateQuery({
      tableName: this.tableName,
      value: this._mappingValuesList({
        ...configMapping,
        ...configTemp,
      }),
      where: [{ column: 'trade_config.id', value: configId }],
    });
  }
}
