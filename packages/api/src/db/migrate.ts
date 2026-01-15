import { Kysely, Migrator, FileMigrationProvider, PostgresDialect } from "kysely";
import pg from "pg";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from monorepo root
dotenv.config({ path: path.join(__dirname, "../../../../.env") });

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 1,
      }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "migrations"),
    }),
  });

  const direction = process.argv[2];

  if (direction === "down") {
    const { error, results } = await migrator.migrateDown();

    results?.forEach((result) => {
      if (result.status === "Success") {
        console.log(`Migration "${result.migrationName}" reverted successfully`);
      } else if (result.status === "Error") {
        console.error(`Failed to revert migration "${result.migrationName}"`);
      }
    });

    if (error) {
      console.error("Migration failed:", error);
      process.exit(1);
    }
  } else {
    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((result) => {
      if (result.status === "Success") {
        console.log(`Migration "${result.migrationName}" executed successfully`);
      } else if (result.status === "Error") {
        console.error(`Failed to execute migration "${result.migrationName}"`);
      }
    });

    if (error) {
      console.error("Migration failed:", error);
      process.exit(1);
    }

    if (results?.length === 0) {
      console.log("No migrations to run - database is up to date");
    }
  }

  await db.destroy();
}

migrate().catch(console.error);
