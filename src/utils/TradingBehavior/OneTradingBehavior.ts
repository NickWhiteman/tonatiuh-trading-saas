import { Order } from 'ccxt';

import {
  GetInfoPriceReturnedType,
  SettingOrderType,
  StartAlgorithmsType,
  WatchingProcessParamType,
} from '../../types/types';
import { TradingBehavior } from './TradingBehavior';
import { ConfigType } from 'repository/types/types';

export class OneTradingBehavior extends TradingBehavior {
  constructor(config: ConfigType) {
    super(config);
  }

  public override async tradingBehavior({
    symbol,
    param,
    candlePriceRange,
    positionSize,
    indexOperation,
  }: {
    param: StartAlgorithmsType;
    symbol: string;
    candlePriceRange: string;
    positionSize: number;
    indexOperation: string;
  }): Promise<WatchingProcessParamType> {
    const { price, highestInCandle, lowestInCandle }: GetInfoPriceReturnedType =
      await this._ExchangeService.getInfoPrice(symbol, candlePriceRange);

    const settingForFirstOrder: SettingOrderType = {
      symbol: symbol,
      type: 'limit',
      amount: positionSize,
      price: +price,
    };

    const firstOrder: Order = await this._OrdersOperationService.openFirstPosition({
      settingForFirstOrder,
      price,
      highestInCandle,
      lowestInCandle,
      indexOperation,
    });

    return { ...param, settingForFirstOrder, firstOrder, price };
  }
}
