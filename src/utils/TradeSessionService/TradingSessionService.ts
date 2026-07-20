import { SessionRepository } from '../../repository/repository/session.repository';

export class TradingSessionService extends SessionRepository {
  constructor(_dbName: string) {
    super(_dbName);
  }
}
