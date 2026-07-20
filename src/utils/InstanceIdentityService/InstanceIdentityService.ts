import { ENV } from '../../plugins/Environment/const';
import { InstanceIdentityRepository } from '../../repository/repository/instance-identity.repository';

export class InstanceIdentityService extends InstanceIdentityRepository {
  constructor() {
    const _configDBName = ENV.APP_MODE === 'desktop' ? 'trading-config-db.sqlite' : 'trading-config-db';
    super(_configDBName);
  }
}
