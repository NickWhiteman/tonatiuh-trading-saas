// import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
// import { HttpAdapterHost } from '@nestjs/core';

// @Catch()
// export class ErrorFilter implements ExceptionFilter {
//   constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

//   catch(exception: unknown, host: ArgumentsHost) {
//     const { httpAdapter } = this.httpAdapterHost;

//     const ctx = host.switchToHttp();

//     const msg = (exception as { message: string })?.message;
//     const status = (exception as { status: number })?.status;

//     httpAdapter.reply(ctx.getResponse(), { message: msg ?? 'Internal server error' }, status ?? 500);
//   }
// }
