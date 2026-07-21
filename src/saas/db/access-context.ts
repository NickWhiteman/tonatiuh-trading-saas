import { AsyncLocalStorage } from 'async_hooks';
import { PoolClient } from 'pg';

type DatabaseAccessContext = { organizationId?: string; platformAdmin?: boolean; service?: boolean };
const storage = new AsyncLocalStorage<DatabaseAccessContext>();
let processScope: 'api' | 'worker' | 'service' = 'api';

export function runWithDatabaseContext<T>(work: () => T): T { return storage.run({}, work); }
export function setTenantDatabaseContext(organizationId: string): void { const context=storage.getStore();if(context)context.organizationId=organizationId; }
export function setPlatformAdminDatabaseContext(): void { const context=storage.getStore();if(context)context.platformAdmin=true; }
export function runWithServiceDatabaseContext<T>(work: () => T): T { return storage.run({...storage.getStore(),service:true},work); }
export function setProcessDatabaseScope(scope: 'api' | 'worker' | 'service'): void { processScope=scope; }

export async function applyDatabaseContext(client: PoolClient): Promise<void> {
  const context=storage.getStore();
  await client.query(`SELECT set_config('app.current_organization_id',$1,true),set_config('app.platform_admin',$2,true),
    set_config('app.service_access',$3,true),set_config('app.worker_access',$4,true)`,[
    context?.organizationId??'',context?.platformAdmin?'true':'false',context?.service||processScope==='service'?'true':'false',processScope==='worker'?'true':'false',
  ]);
}
