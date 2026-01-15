import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Enable UUID extension
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`.execute(db);

  // Users table
  await db.schema
    .createTable("users")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("email", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("password_hash", "varchar(255)", (col) => col.notNull())
    .addColumn("role", "varchar(50)", (col) => col.defaultTo("admin"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.defaultTo(sql`NOW()`).notNull()
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.defaultTo(sql`NOW()`).notNull()
    )
    .execute();

  // Clients table
  await db.schema
    .createTable("clients")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("primary_domain", "varchar(255)")
    .addColumn("timezone", "varchar(100)", (col) => col.defaultTo("UTC"))
    .addColumn("contact_emails", sql`text[]`, (col) => col.defaultTo(sql`'{}'`))
    .addColumn("created_by", "uuid", (col) =>
      col.references("users.id").notNull()
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.defaultTo(sql`NOW()`).notNull()
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.defaultTo(sql`NOW()`).notNull()
    )
    .execute();

  await db.schema
    .createIndex("idx_clients_created_by")
    .on("clients")
    .column("created_by")
    .execute();

  // Data sources table
  await db.schema
    .createTable("data_sources")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("client_id", "uuid", (col) =>
      col.references("clients.id").onDelete("cascade").notNull()
    )
    .addColumn("type", "varchar(50)", (col) => col.notNull())
    .addColumn("external_account_id", "varchar(255)")
    .addColumn("external_account_name", "varchar(255)")
    .addColumn("credentials_encrypted", "text")
    .addColumn("connected_at", "timestamptz", (col) =>
      col.defaultTo(sql`NOW()`)
    )
    .addColumn("expires_at", "timestamptz")
    .addColumn("status", "varchar(50)", (col) => col.defaultTo("active"))
    .addColumn("config", "jsonb", (col) => col.defaultTo(sql`'{}'`))
    .addColumn("created_at", "timestamptz", (col) =>
      col.defaultTo(sql`NOW()`).notNull()
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.defaultTo(sql`NOW()`).notNull()
    )
    .execute();

  await db.schema
    .createIndex("idx_data_sources_client_id")
    .on("data_sources")
    .column("client_id")
    .execute();

  await db.schema
    .createIndex("idx_data_sources_type")
    .on("data_sources")
    .column("type")
    .execute();

  // Snapshots table
  await db.schema
    .createTable("snapshots")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("client_id", "uuid", (col) =>
      col.references("clients.id").onDelete("cascade").notNull()
    )
    .addColumn("snapshot_date", "date", (col) => col.notNull())
    .addColumn("template_version", "varchar(50)", (col) =>
      col.defaultTo("1.0")
    )
    .addColumn("storage_path", "varchar(500)", (col) => col.notNull())
    .addColumn("pdf_storage_path", "varchar(500)")
    .addColumn("metrics_summary", "jsonb", (col) => col.defaultTo(sql`'{}'`))
    .addColumn("created_at", "timestamptz", (col) =>
      col.defaultTo(sql`NOW()`).notNull()
    )
    .addColumn("expires_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("idx_snapshots_client_id")
    .on("snapshots")
    .column("client_id")
    .execute();

  await db.schema
    .createIndex("idx_snapshots_date")
    .on("snapshots")
    .column("snapshot_date")
    .execute();

  // Unique constraint for client + snapshot_date
  await sql`ALTER TABLE snapshots ADD CONSTRAINT unique_client_snapshot_date UNIQUE (client_id, snapshot_date)`.execute(
    db
  );

  // Jobs table
  await db.schema
    .createTable("jobs")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("client_id", "uuid", (col) =>
      col.references("clients.id").onDelete("cascade").notNull()
    )
    .addColumn("snapshot_id", "uuid", (col) =>
      col.references("snapshots.id").onDelete("set null")
    )
    .addColumn("type", "varchar(50)", (col) => col.notNull())
    .addColumn("status", "varchar(50)", (col) => col.defaultTo("pending"))
    .addColumn("started_at", "timestamptz")
    .addColumn("finished_at", "timestamptz")
    .addColumn("error_message", "text")
    .addColumn("retry_count", "integer", (col) => col.defaultTo(0))
    .addColumn("metadata", "jsonb", (col) => col.defaultTo(sql`'{}'`))
    .addColumn("created_at", "timestamptz", (col) =>
      col.defaultTo(sql`NOW()`).notNull()
    )
    .execute();

  await db.schema
    .createIndex("idx_jobs_client_id")
    .on("jobs")
    .column("client_id")
    .execute();

  await db.schema
    .createIndex("idx_jobs_status")
    .on("jobs")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_jobs_created_at")
    .on("jobs")
    .column("created_at")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("jobs").execute();
  await db.schema.dropTable("snapshots").execute();
  await db.schema.dropTable("data_sources").execute();
  await db.schema.dropTable("clients").execute();
  await db.schema.dropTable("users").execute();
}
