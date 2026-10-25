import sql from "mssql";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function migrate(): Promise<void> {
  let connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    try {
      const settingsPath = path.resolve(process.cwd(), "local.settings.json");
      const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
        Values?: { SQL_CONNECTION_STRING?: string };
      };
      connectionString = settings.Values?.SQL_CONNECTION_STRING;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("Could not read services/api/local.settings.json");
      }
    }
  }
  if (!connectionString) throw new Error("SQL_CONNECTION_STRING is required to apply migrations");

  const pool = await new sql.ConnectionPool(connectionString).connect();
  try {
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.SchemaMigrations', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.SchemaMigrations (
          version varchar(200) NOT NULL PRIMARY KEY,
          appliedAt datetime2 NOT NULL CONSTRAINT DF_SchemaMigrations_applied DEFAULT SYSUTCDATETIME()
        );
      END;
    `);

    const directory = path.resolve(process.cwd(), "../../database/migrations");
    const files = (await readdir(directory))
      .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
      .sort();
    if (!files.length) throw new Error(`No versioned SQL migrations found in ${directory}`);

    for (const version of files) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        await new sql.Request(transaction).query(`
          DECLARE @lockResult int;
          EXEC @lockResult = sys.sp_getapplock
            @Resource = N'MF-Sales-Site schema migrations',
            @LockMode = N'Exclusive',
            @LockOwner = N'Transaction',
            @LockTimeout = 30000;
          IF @lockResult < 0 THROW 51000, 'Could not acquire schema migration lock', 1;
        `);
        const applied = await new sql.Request(transaction)
          .input("version", sql.VarChar(200), version)
          .query("SELECT version FROM dbo.SchemaMigrations WHERE version=@version");
        if (applied.recordset.length) {
          await transaction.commit();
          console.log(`Already applied: ${version}`);
          continue;
        }

        const migration = await readFile(path.join(directory, version), "utf8");
        await new sql.Request(transaction).batch(migration);
        await new sql.Request(transaction)
          .input("version", sql.VarChar(200), version)
          .query("INSERT dbo.SchemaMigrations(version) VALUES (@version)");
        await transaction.commit();
        console.log(`Applied: ${version}`);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }
  } finally {
    await pool.close();
  }
}

migrate().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});
