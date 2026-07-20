import Router, { Request, Response } from 'express';
import { InstanceIdentityService } from '../utils/InstanceIdentityService/InstanceIdentityService';
import { sendError } from './router.utils';

const identityRouter = Router();
const identityRepo = new InstanceIdentityService();

identityRouter.get(`/getInstance`, async (req: Request, res: Response) => {
  try {
    const result = await identityRepo.getInstance();
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
});

export default identityRouter;
