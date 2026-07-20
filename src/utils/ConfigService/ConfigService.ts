import { ENV } from '../../plugins/Environment/const';
import { ConfigRepository } from '../../repository/repository/config.repository';

export class ConfigService extends ConfigRepository {
  constructor() {
    const _configDBName = ENV.APP_MODE === 'desktop' ? 'trading-config-db.sqlite' : 'trading-config-db';
    super(_configDBName);
  }
}
