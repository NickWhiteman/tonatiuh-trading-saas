import { Order } from 'ccxt';
import { ConfigRepository } from '../../repository/repository/config.repository';
import { SettingCheckingEmergencyStopParam } from 'types/types';
import { IEmergencyStopService } from 'interfaces';
import { ConfigService } from '../../utils/ConfigService/ConfigService';

export class EmergencyStopService implements IEmergencyStopService {
  private _ConfigService: ConfigService;

  constructor() {
    this._ConfigService = new ConfigService();
  }

  public async emergencyDisableProcess({
    isEmergencyStop,
    closeAllAmount,
  }: SettingCheckingEmergencyStopParam): Promise<true | undefined> {
    if (!isEmergencyStop) {
      return;
    }

    await closeAllAmount();
    await this._disabledEmergencyStop();
    return true;
  }

  public async checkingIsEmergencyStop({
    configId,
    closeAllAmount,
  }: {
    configId: number;
    closeAllAmount: () => Promise<Order>;
  }): Promise<true | undefined> {
    try {
      const isEmergencyStop = await this.toggleIsEmergencyStop(configId);
      const result = await this.emergencyDisableProcess({ isEmergencyStop, closeAllAmount });
      return result;
    } catch (error) {
      console.error(error);
    }
  }

  public async toggleIsEmergencyStop(configId: number): Promise<boolean> {
    const { isEmergencyStop } = await this._ConfigService.getEmergencyStop(configId);
    console.log('_getIsEmergencyStop => ', isEmergencyStop);
    return isEmergencyStop;
  }

  private async _disabledEmergencyStop(): Promise<void> {
    await this._ConfigService.disableEmergencyStop();
  }
}
