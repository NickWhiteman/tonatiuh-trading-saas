import { Order } from 'ccxt';
import {
  ParametersForCheckingOrdersForOpenOpposideSideType,
  CheckingOrderType,
  ParametersForCheckWhichOrderActivatedHowPositionsCloseOpenNextOrderType,
} from '../types/types';

export interface IOrderCheckingService {
  checkingOrdersWhenOrderStatusCloseCreateNewOrderForLiqudationOpenPositionsOnExchange(
    paramOrder: ParametersForCheckingOrdersForOpenOpposideSideType,
  ): Promise<CheckingOrderType>;
  checkWhichOrderActivatedHowPositionsClosedWaitingResult(
    paramOrder: ParametersForCheckWhichOrderActivatedHowPositionsCloseOpenNextOrderType,
  ): Promise<Order>;
}
