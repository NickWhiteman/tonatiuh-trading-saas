export class SaasHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SaasHttpError';
  }
}

export const validationError = (message: string, details?: unknown) =>
  new SaasHttpError(400, 'VALIDATION_ERROR', message, details);
export const forbidden = (message = 'Access denied.') =>
  new SaasHttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource was not found.') =>
  new SaasHttpError(404, 'NOT_FOUND', message);
