import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getSaasConfig } from '../config';
import { logger } from '../observability/logger';

let pool: Pool | undefined;

export function getSaasPool(): Pool {
  if (!pool) {
    const config = getSaasConfig();
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolSize,
      idleTimeoutMillis: config.databaseIdleTimeoutMs,
      connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
      application_name: 'tonatiuh-trading-saas',
    });
    pool.on('error',(error)=>logger.error({err:error},'unexpected PostgreSQL pool error'));
  }
  return pool;
}

export function saasQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return getSaasPool().query<T>(text, values);
}

export async function saasTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getSaasPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
