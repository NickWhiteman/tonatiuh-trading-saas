import { ConfigType } from 'repository/types/types';

export interface ITrading {
  startAlgorithms: (config: ConfigType) => Promise<void>;
}
