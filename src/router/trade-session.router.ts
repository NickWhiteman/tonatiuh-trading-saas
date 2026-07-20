import Router, { Request, Response } from 'express';
import { TradingSessionService } from '../utils/TradeSessionService/TradingSessionService';
import { GetDatabaseList } from '../plugins/FileSystemUtils/GetFileSystem/GetDatabaseList';
import { parsePositiveId, sendError } from './router.utils';

const tradeSessionRouter = Router();
const databaseList = Object.values(new GetDatabaseList().getDatabaseList());
const tradeSessionRepo = databaseList.flatMap((database) => new TradingSessionService(database));

tradeSessionRouter.get(`/getActiveSession/:configId`, async (req: Request, res: Response) => {
  try {
    const configId = parsePositiveId(req.params.configId, 'configId');
    const result = await Promise.all(
      tradeSessionRepo.flatMap(async (repo) => await repo.checkingActiveSession(configId)),
    );
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
});

tradeSessionRouter.get(`/getAllSession`, async (req: Request, res: Response) => {
  try {
    const result = await Promise.all(tradeSessionRepo.flatMap(async (repo) => await repo.getAllSession()));
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
});

tradeSessionRouter.get(`/getAllHistorySession`, async (req: Request, res: Response) => {
  try {
    const result = await Promise.all(tradeSessionRepo.flatMap(async (repo) => await repo.getAllSession()));
    // const result = await Promise.all(tradeSessionRepo.flatMap(async (repo) => await repo.getAllNotActiveSession()));
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
});

tradeSessionRouter.get(`/getAllProfitSession`, async (req: Request, res: Response) => {
  try {
    const result = await Promise.all(tradeSessionRepo.flatMap(async (repo) => await repo.getAllProfitSession()));
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
});

export default tradeSessionRouter;
