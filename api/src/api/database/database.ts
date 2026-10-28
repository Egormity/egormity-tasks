import { Pool, type PoolClient, type QueryResultRow } from "pg";

import { currentSchemaVersion, initialSchema } from "./schema.js";

export interface QueryExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<Row[]>;
}

class ClientQueryExecutor implements QueryExecutor {
  constructor(private readonly client: PoolClient) {}

  query = async <Row extends QueryResultRow = QueryResultRow>(
    statement: string,
    values: readonly unknown[] = [],
  ) => (await this.client.query<Row>(statement, [...values])).rows;
}

export class PostgresDatabase implements QueryExecutor {
  readonly pool: Pool;

  constructor(connection: string | Pool) {
    this.pool =
      typeof connection === "string"
        ? new Pool({
            connectionString: connection,
            max: 10,
            connectionTimeoutMillis: 5_000,
            idleTimeoutMillis: 30_000,
          })
        : connection;
    this.pool.on("error", (error) => {
      console.error("Unexpected PostgreSQL connection error:", error.name);
    });
  }

  query = async <Row extends QueryResultRow = QueryResultRow>(
    statement: string,
    values: readonly unknown[] = [],
  ) => (await this.pool.query<Row>(statement, [...values])).rows;

  transaction = async <Result>(action: (executor: QueryExecutor) => Promise<Result>) => {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await action(new ClientQueryExecutor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  migrate = async () => {
    await this.transaction(async (executor) => {
      await executor.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const applied = await executor.query<{ version: number }>(
        "SELECT version FROM schema_migrations WHERE version = $1",
        [currentSchemaVersion],
      );
      if (applied.length) return;
      await executor.query(initialSchema);
      await executor.query(
        "INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
        [currentSchemaVersion, "initial_postgres_schema"],
      );
    });
  };

  healthCheck = async () => {
    await this.query("SELECT 1");
  };

  close = () => this.pool.end();
}
