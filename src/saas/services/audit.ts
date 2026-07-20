import { Request } from 'express';
import { saasQuery } from '../db/pool';

export async function writeAuditEvent(
  req: Request,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await saasQuery(
    `INSERT INTO audit_events
      (organization_id, actor_user_id, action, entity_type, entity_id, request_id, ip_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [req.auth?.organizationId ?? null, req.auth?.userId ?? null, action, entityType ?? null,
      entityId ?? null, req.requestId ?? null, req.ip, JSON.stringify(metadata)],
  );
}
