declare namespace Express {
  interface Request {
    requestId?: string;
    auth?: {
      userId: string;
      organizationId: string;
      role: 'OWNER' | 'ADMIN' | 'TRADER' | 'ANALYST' | 'BILLING' | 'VIEWER';
    };
  }
}
