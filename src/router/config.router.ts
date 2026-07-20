import Router, { Request, Response } from 'express';
import { ConfigType } from '../repository/types/types';
import { ConfigService } from '../utils/ConfigService/ConfigService';
import { tradingWorkerManager } from '../process/TradingWorkerManager';
import { parsePositiveId, sendError, validateConfigPayload } from './router.utils';

const configRouter = Router();
const configRepo = new ConfigService();

configRouter.get(`/getConfig`, async (req: Request, res: Response) => {
  try {
    const result = (await configRepo.getConfig()).flatMap((config) => {
      const { apiKey, privateKey, password, ...configMap } = config;
      return configMap;
    });
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
});

configRouter.post(`/updateConfig`, async (req: Request, res: Response) => {
  try {
    const payload = validateConfigPayload(req.body, true);
    const { id, ...config } = payload;
    await configRepo.updateConfig(config as Partial<ConfigType>, parsePositiveId(id));
    res.status(200).send('Config updated');
  } catch (error) {
    sendError(res, error);
  }
});

configRouter.post(`/createConfig`, async (req: Request, res: Response) => {
  try {
    const config = validateConfigPayload(req.body, false) as ConfigType;
    await configRepo.createConfig(config);
    res.status(200).send('Config created!');
  } catch (error) {
    sendError(res, error);
  }
});

configRouter.post(`/disableAutostart`, async (req: Request, res: Response) => {
  try {
    const configId = parsePositiveId(req.body?.configId, 'configId');
    await configRepo.disableAutoStartTrading(configId);
    res.status(200).send('Autostart trading disabled!');
  } catch (error) {
    sendError(res, error);
  }
});

configRouter.post(`/emergencyStop`, async (req: Request, res: Response) => {
  try {
    const configId = parsePositiveId(req.body?.configId, 'configId');
    await configRepo.enableEmergencyStop(configId);
    res.status(200).send('Emergency stop enabled!');
  } catch (error) {
    sendError(res, error);
  }
});

configRouter.post(`/stopTrading`, async (req: Request, res: Response) => {
  try {
    const configId = parsePositiveId(req.body?.configId, 'configId');
    await configRepo.enableStopTrading(configId);
    const stopped = tradingWorkerManager.stop(configId);
    res.status(200).send({ message: 'Stop trading enabled!', stopped });
  } catch (error) {
    sendError(res, error);
  }
});

export default configRouter;
