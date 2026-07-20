import { ENV } from '../../plugins/Environment/const';
import { BalanceRepository } from '../../repository/repository/balance.repository';

export class BalanceService extends BalanceRepository {
  constructor() {
    const _configDBName = ENV.APP_MODE === 'desktop' ? 'trading-config-db.sqlite' : 'trading-config-db';
    super(_configDBName);
  }
}
