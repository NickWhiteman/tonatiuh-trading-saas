import http from 'http';
import { Server } from 'socket.io';
import { ILoggerService } from 'interfaces/ILoggerService';
import { LoggerType } from 'types/types';
import { pid } from 'process';

export class LoggerService implements ILoggerService {
  private io: Server;
  private server: http.Server;

  constructor(port: number) {
    this.server = http.createServer();
    this.server.listen(port, () => {
      console.log(`Logger service listening on port ${port}`);
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

  public async loggerStrategy({
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
    configId,
  }: LoggerType) {
    console.log();
    console.log();
    console.log('==================================');
    console.log('balance =>', balance.free);
    console.log('profitPrice =>', {
      profitPrice,
      amount: price * percentProfit + options.buyingBack * takerFee,
    });
    console.log('newBuyback => ', { buyBack: -(price * (percentBuyBackStep * options.drawdownStep)) });
    console.log('deltaForSale => ', { deltaForSale: side === 'sell' ? +deltaForSale : 'none' });
    console.log('deltaForBuy => ', { deltaForBuy: side === 'buy' ? +deltaForBuy : 'none' });
    console.log('unrealizedPnl => ', { unrealizedPnl });
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
