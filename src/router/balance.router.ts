import Router, { Request, Response } from 'express';
import { BalanceService } from '../utils/BalanceService/BalanceService';
import { sendError } from './router.utils';

const balanceRouter = Router();
const balanceRepo = new BalanceService();

balanceRouter.get(`/getBalance`, async (req: Request, res: Response) => {
  try {
    const result = await balanceRepo.getBalance();
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
});

balanceRouter.get(`/getAllBalance`, async (req: Request, res: Response) => {
  try {
    const result = await balanceRepo.getAllBalance();
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
});

export default balanceRouter;
