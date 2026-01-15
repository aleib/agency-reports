import type { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely";

// Enum types
export type DataSourceType = "google_analytics" | "google_ads" | "rank_tracker";
export type DataSourceStatus = "active" | "expired" | "disconnected";
export type JobType = "snapshot" | "render" | "email" | "full_report";
export type JobStatus = "pending" | "running" | "completed" | "failed";

// Database column types
export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string;
  password_hash: string;
  role: ColumnType<"admin", "admin" | undefined, "admin">;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export interface ClientsTable {
  id: Generated<string>;
  name: string;
  primary_domain: string | null;
  timezone: ColumnType<string, string | undefined, string>;
  contact_emails: ColumnType<string[], string[] | undefined, string[]>;
  created_by: string;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export interface DataSourcesTable {
  id: Generated<string>;
  client_id: string;
  type: "google_analytics" | "google_ads" | "rank_tracker";
  external_account_id: string | null;
  external_account_name: string | null;
  credentials_encrypted: string | null;
  connected_at: ColumnType<Date, Date | undefined, Date>;
  expires_at: Date | null;
  status: ColumnType<
    "active" | "expired" | "disconnected",
    "active" | "expired" | "disconnected" | undefined,
    "active" | "expired" | "disconnected"
  >;
  config: ColumnType<Record<string, unknown>, Record<string, unknown> | undefined, Record<string, unknown>>;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export interface SnapshotsTable {
  id: Generated<string>;
  client_id: string;
  snapshot_date: Date;
  template_version: ColumnType<string, string | undefined, string>;
  storage_path: string;
  pdf_storage_path: string | null;
  metrics_summary: ColumnType<Record<string, unknown>, Record<string, unknown> | undefined, Record<string, unknown>>;
  created_at: ColumnType<Date, Date | undefined, never>;
  expires_at: Date | null;
}

export interface JobsTable {
  id: Generated<string>;
  client_id: string;
  snapshot_id: string | null;
  type: "snapshot" | "render" | "email" | "full_report";
  status: ColumnType<
    "pending" | "running" | "completed" | "failed",
    "pending" | "running" | "completed" | "failed" | undefined,
    "pending" | "running" | "completed" | "failed"
  >;
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
  retry_count: ColumnType<number, number | undefined, number>;
  metadata: ColumnType<Record<string, unknown>, Record<string, unknown> | undefined, Record<string, unknown>>;
  created_at: ColumnType<Date, Date | undefined, never>;
}

// Database schema
export interface Database {
  users: UsersTable;
  clients: ClientsTable;
  data_sources: DataSourcesTable;
  snapshots: SnapshotsTable;
  jobs: JobsTable;
}

// Helper types for each table
export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type Client = Selectable<ClientsTable>;
export type NewClient = Insertable<ClientsTable>;
export type ClientUpdate = Updateable<ClientsTable>;

export type DataSource = Selectable<DataSourcesTable>;
export type NewDataSource = Insertable<DataSourcesTable>;
export type DataSourceUpdate = Updateable<DataSourcesTable>;

export type Snapshot = Selectable<SnapshotsTable>;
export type NewSnapshot = Insertable<SnapshotsTable>;
export type SnapshotUpdate = Updateable<SnapshotsTable>;

export type Job = Selectable<JobsTable>;
export type NewJob = Insertable<JobsTable>;
export type JobUpdate = Updateable<JobsTable>;
