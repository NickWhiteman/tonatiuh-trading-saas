import { ConfigType } from 'repository/types/types';
import { ITrading } from '../../interfaces/ITrading';
import { WatchingTakeProfitLogicType } from '../../types/types';
import { AbstractTradingClass } from '../abstract.trading';

export class TradingVectorProfitService extends AbstractTradingClass implements ITrading {
  constructor() {
    super();
  }

  /**
   * This method starting algorithm trading
   */
  async startAlgorithms(config: ConfigType): Promise<void> {
    this._config = config;
    this._SYMBOL = config.symbol;
    await this._initGeneralUtils(config);
    await this._ConfigService.recordLogger(this._loggerIdentity, this._config.id);
    console.log(`=> AbstractTradingClass initialized!`);

    await this._startTradingSession({
      typeTrading: 'one-trade',
      watchingTakeProfitLogic: async (param: WatchingTakeProfitLogicType) =>
        await this._watchingTakeProfitLogic(param),
    });
  }

  private async _watchingTakeProfitLogic({
    side,
    profitPrice,
    unrealizedPnl,
    settingTakeProfit,
  }: WatchingTakeProfitLogicType): Promise<boolean> {
    if (unrealizedPnl >= this._config.percentProfit) {
      if (this._config.isPercentTargetAfterTakeProfit) {
        const resultTakeProfitBehavior = await this._onPriceTracker({
          side: side === 'sell' ? 'buy' : 'sell',
          settingOrder: settingTakeProfit,
        });

        if (resultTakeProfitBehavior) {
          console.log('======> TakeProfit close all positions!');
          return true;
        }
      }

      if (!this._config.isPercentTargetAfterTakeProfit) {
        const closingOrder = await this._OrdersOperationService.closeFilledPosition(this._SYMBOL, this._indexOperation);
        if (!closingOrder) return false;
        console.log('======> TakeProfit close all positions!');
        return true;
      }
    }

    return false;
  }

  /**
   * This method finishing algorithm trading
   */
  async endAlgorithms(): Promise<void> {
    if (!this._OrdersOperationService || !this._SYMBOL) return;
    await this._OrdersOperationService.closeFilledPosition(this._SYMBOL, this._indexOperation);
  }
}
