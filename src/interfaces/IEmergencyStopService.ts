import { Order } from 'ccxt';

import { SettingCheckingEmergencyStopParam } from 'types/types';

export interface IEmergencyStopService {
  emergencyDisableProcess: (param: SettingCheckingEmergencyStopParam) => Promise<true | undefined>;
  checkingIsEmergencyStop: (param: {
    configId: number;
    closeAllAmount: () => Promise<Order>;
  }) => Promise<true | undefined>;
  toggleIsEmergencyStop: (configId: number) => Promise<boolean>;
}
