import http from 'http';
import { Server } from 'socket.io';
import { ILoggerService } from 'interfaces/ILoggerService';
import { LoggerType } from 'types/types';
import { pid } from 'process';

export class LoggerService implements ILoggerService {
  private io: Server;
  private server: http.Server;
  private listening: Promise<void>;

  constructor(port: number) {
    this.server = http.createServer();
    this.listening = new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        this.server.off('listening', onListening);
        reject(new Error(`Logger service failed to listen on port ${port}: ${error.code ?? error.message}`));
      };
      const onListening = () => {
        this.server.off('error', onError);
        this.server.on('error', (error) => console.error('Logger service error:', error));
        const address = this.server.address();
        const listeningPort = address && typeof address === 'object' ? address.port : port;
        console.log(`Logger service listening on port ${listeningPort}`);
        resolve();
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(port);
    });

    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
    console.log('logger init');
  }

  public async ready(): Promise<void> {
    await this.listening;
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.io.close(() => {
        if (!this.server.listening) {
          resolve();
          return;
        }
        this.server.close((error) => (error ? reject(error) : resolve()));
      });
    });
  }

  public async loggerStrategy({
    _identity,
    balance,
    price,
    unrealizedPnl,
    pnlPerUnit,
    positionPnl,
    averageEntryPrice,
    entryAmount,
    buyBackAmount,
    lastPrice,
    side,
    profitPrice,
    percentProfit,
    percentBuyBackStep,
    takerFee,
    options,
    orders,
    deltaForSale,
    deltaForBuy,
    configId,
  }: LoggerType) {
    console.log();
    console.log();
    console.log('==================================');
    console.log('balance =>', balance.free);
    console.log('profitPrice =>', {
      profitPrice,
      targetProfitPerUnit: averageEntryPrice * percentProfit,
      estimatedPositionProfit: averageEntryPrice * percentProfit * entryAmount,
    });
    console.log('buyback => ', {
      triggerLossPerUnit: -buyBackAmount,
      triggerRatio: -(percentBuyBackStep * options.drawdownStep),
      triggerPrice:
        side === 'buy' ? averageEntryPrice - buyBackAmount : averageEntryPrice + buyBackAmount,
    });
    console.log('deltaForSale => ', { deltaForSale: side === 'sell' ? +deltaForSale : 'none' });
    console.log('deltaForBuy => ', { deltaForBuy: side === 'buy' ? +deltaForBuy : 'none' });
    console.log('pnl => ', {
      perUnit: pnlPerUnit,
      position: positionPnl,
      ratio: unrealizedPnl,
      percent: unrealizedPnl * 100,
      entryAmount,
    });
    console.log('lastPrice => ', { lastPrice });
    console.log('options => ', { options });
    console.log(
      'orders => ',
      orders.flatMap((item) => ({ id: item.orderId ?? item.id, side: item.side })),
    );
    console.log('PID => ', { PID: pid });
    console.log('==================================');
    console.log();
    console.log();

    console.log(`${_identity}`);
    console.log(`configId: ${configId}`);
    this.io.emit(`log-${_identity}`, {
      _identity,
      balance,
      price,
      unrealizedPnl,
      lastPrice,
      side,
      profitPrice,
      percentProfit,
      percentBuyBackStep,
      takerFee,
      options,
      orders,
      deltaForSale,
      deltaForBuy,
    });
  }
}
