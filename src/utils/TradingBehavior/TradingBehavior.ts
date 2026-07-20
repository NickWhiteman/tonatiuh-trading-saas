import { IExchangeService, IOrdersOperationService } from 'interfaces';
import { ExchangeService } from '../ExchangeService/ExchangeService';
import { OrdersOperationService } from '../OrdersOperationService/OrdersOperationService';
import { StartAlgorithmsType, WatchingProcessParamType } from '../../types/types';
import { ConfigType } from 'repository/types/types';

export class TradingBehavior {
  protected _config: ConfigType;
  protected _OrdersOperationService: IOrdersOperationService;
  protected _ExchangeService: IExchangeService;

  constructor(config: ConfigType) {
    this._config = config;
    this._OrdersOperationService = new OrdersOperationService(config);
    this._ExchangeService = new ExchangeService(config.exchange, config.apiKey, config.privateKey, config.password);
  }

  public async tradingBehavior(param: {
    param: StartAlgorithmsType;
    symbol: string;
    candlePriceRange: string;
    positionSize: number;
    indexOperation: string;
  }): Promise<WatchingProcessParamType> {
    return {} as WatchingProcessParamType;
  }
}
