import sql from "mssql";
import { hashToken } from "./security.js";

let poolPromise: Promise<sql.ConnectionPool> | undefined;
export function db(): Promise<sql.ConnectionPool> {
  const connection = process.env.SQL_CONNECTION_STRING;
  if (!connection) throw new Error("SQL_CONNECTION_STRING is not configured");
  if (!poolPromise) poolPromise = new sql.ConnectionPool(connection).connect();
  return poolPromise;
}

export const plans = {
  monthly: { price: 200, deviceLimit: 1, durationDays: 30 },
  lifetime: { price: 1500, deviceLimit: 3, durationDays: null }
} as const;

export async function audit(actor: string, action: string, orderId?: string): Promise<void> {
  const pool = await db();
  await pool.request()
    .input("actor", sql.NVarChar(120), actor)
    .input("action", sql.NVarChar(80), action)
    .input("orderId", sql.UniqueIdentifier, orderId ?? null)
    .query("INSERT dbo.AuditEvents(actor, action, orderId) VALUES (@actor, @action, @orderId)");
}

export async function withinRateLimit(bucket: string, maximum: number, windowSeconds: number): Promise<boolean> {
  const pool = await db();
  const result = await pool.request().input("bucket", sql.Char(64), hashToken(bucket))
    .input("window", sql.Int, windowSeconds)
    .query(`MERGE dbo.RateLimits WITH (HOLDLOCK) AS target
      USING (SELECT @bucket bucketHash) AS source ON target.bucketHash=source.bucketHash
      WHEN MATCHED AND target.windowStartedAt<=DATEADD(second,-@window,SYSUTCDATETIME())
        THEN UPDATE SET windowStartedAt=SYSUTCDATETIME(),requestCount=1
      WHEN MATCHED THEN UPDATE SET requestCount=target.requestCount+1
      WHEN NOT MATCHED THEN INSERT(bucketHash,windowStartedAt,requestCount) VALUES(source.bucketHash,SYSUTCDATETIME(),1)
      OUTPUT inserted.requestCount AS requestCount;`);
  return result.recordset[0].requestCount <= maximum;
}
