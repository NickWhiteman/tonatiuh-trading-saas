import Router, { Request, Response } from 'express';
import { OrderRepository } from '../repository/repository/order.repository';
import { GetDatabaseList } from '../plugins/FileSystemUtils/GetFileSystem/GetDatabaseList';
import { HttpError, sendError } from './router.utils';

const tradeOperationRouter = Router();
const databaseList = Object.values(new GetDatabaseList().getDatabaseList());
const tradeOperationRepo = databaseList.flatMap((database) => new OrderRepository(database));

tradeOperationRouter.get(`/getAllActiveOrders`, async (req: Request, res: Response) => {
  try {
    const result = await Promise.all(tradeOperationRepo.flatMap(async (repo) => await repo.getAllActiveOrders()));
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
});

tradeOperationRouter.get(`/getAllOrdersByIndexOperation/:indexOperation`, async (req: Request, res: Response) => {
  try {
    const indexOperation = req.params.indexOperation;
    if (!indexOperation || indexOperation.length > 128) throw new HttpError(400, 'Invalid indexOperation.');
    const result = await Promise.all(
      tradeOperationRepo.flatMap(async (repo) => repo.getAllOrdersByIndexOperation(indexOperation)),
    );
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
});

export default tradeOperationRouter;
