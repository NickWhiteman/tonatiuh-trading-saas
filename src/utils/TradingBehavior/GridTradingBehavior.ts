import { Ticker } from 'ccxt';

import { ModeType, StartAlgorithmsType, WatchingProcessParamType } from '../../types/types';
import { TradingBehavior } from './TradingBehavior';
import { ConfigType } from 'repository/types/types';

export class GridTradingBehavior extends TradingBehavior {
  constructor(config: ConfigType) {
    super(config);
  }

  public override async tradingBehavior({
    symbol,
    param,
    positionSize,
    indexOperation,
  }: {
    param: StartAlgorithmsType;
    symbol: string;
    candlePriceRange: string;
    positionSize: number;
    indexOperation: string;
  }): Promise<WatchingProcessParamType> {
    const sideMode: ModeType[] = ['buy', 'sell'];
    const { countGridSize, gridSize } = this._config;
    const ticker: Ticker = await this._ExchangeService.getTick(symbol);

    if (!countGridSize || !gridSize) {
      throw new Error('Parameters countGridSize or gridSize must be provided.');
    }

    for (const side of sideMode) {
      for (let i = 0; i < countGridSize; i++) {
        const conditionPriceOpen = countGridSize === 1 ? 1 : i * 2;
        const price = ticker + (side === 'buy' ? gridSize * conditionPriceOpen : -(gridSize * conditionPriceOpen));

        await this._OrdersOperationService.openPositionForStrategy({
          side,
          settingOrder: {
            symbol: symbol,
            type: 'limit',
            amount: positionSize,
            price: price,
          },
          indexOperation,
        });
      }
    }

    return { ...param } as unknown as WatchingProcessParamType;
  }
}
