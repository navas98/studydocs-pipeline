import type { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import type { Db } from 'mongodb';
import type { CheckHealth, HealthStatus } from './app.js';

export function createCheckHealth(db: Db, esClient: ElasticsearchClient): CheckHealth {
  return async () => {
    const [mongo, elasticsearch] = await Promise.all([
      db
        .command({ ping: 1 })
        .then((): HealthStatus => 'ok')
        .catch((): HealthStatus => 'error'),
      esClient
        .ping()
        .then((): HealthStatus => 'ok')
        .catch((): HealthStatus => 'error'),
    ]);
    return { mongo, elasticsearch };
  };
}
