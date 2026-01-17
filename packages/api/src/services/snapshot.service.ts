import {
  calculateChange,
  fetchGA4Metrics,
  getMonthDateRange,
  getPreviousMonthDateRange,
  type GA4Metrics,
} from "../connectors/google-analytics.connector.js";
import { getDb } from "../db/database.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { loadSnapshotData, loadSnapshotDataFromPath, saveSnapshotData } from "./storage.service.js";

export interface SnapshotData {
  clientId: string;
  clientName: string;
  snapshotDate: string;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  templateVersion: string;
  generatedAt: string;
  ga4?: {
    propertyId: string;
    propertyName: string;
    current: GA4Metrics;
    previous: GA4Metrics;
    changes: {
      sessions: number;
      users: number;
      newUsers: number;
      pageviews: number;
      avgSessionDuration: number;
      bounceRate: number;
    };
  };
}

export interface SnapshotSummary {
  id: string;
  clientId: string;
  snapshotDate: string;
  templateVersion: string;
  hasPdf: boolean;
  metricsSummary: {
    sessions?: number;
    users?: number;
    pageviews?: number;
  };
  createdAt: Date;
}

/**
 * Generate a snapshot for a client for a specific month
 */
export async function generateSnapshot(
  clientId: string,
  userId: string,
  year: number,
  month: number,
  regenerate = false
): Promise<SnapshotSummary> {
  const db = getDb();

  // Verify client ownership
  const client = await db
    .selectFrom("clients")
    .select(["id", "name"])
    .where("id", "=", clientId)
    .where("created_by", "=", userId)
    .executeTakeFirst();

  if (!client) {
    throw new NotFoundError("Client not found");
  }

  // Format snapshot date as first of month
  const snapshotDate = `${year}-${String(month).padStart(2, "0")}-01`;

  // Check for existing snapshot
  const existing = await db
    .selectFrom("snapshots")
    .select("id")
    .where("client_id", "=", clientId)
    .where("snapshot_date", "=", new Date(snapshotDate))
    .executeTakeFirst();

  if (existing && !regenerate) {
    throw new ValidationError("Snapshot already exists for this month. Use regenerate=true to overwrite.");
  }

  // Get GA4 data source
  const ga4DataSource = await db
    .selectFrom("data_sources")
    .select(["id", "external_account_id", "external_account_name", "config"])
    .where("client_id", "=", clientId)
    .where("type", "=", "google_analytics")
    .where("status", "=", "active")
    .executeTakeFirst();

  // Get date ranges
  const currentRange = getMonthDateRange(year, month);
  const previousRange = getPreviousMonthDateRange(year, month);

  // Build snapshot data
  const snapshotData: SnapshotData = {
    clientId,
    clientName: client.name,
    snapshotDate,
    periodStart: currentRange.startDate,
    periodEnd: currentRange.endDate,
    previousPeriodStart: previousRange.startDate,
    previousPeriodEnd: previousRange.endDate,
    templateVersion: "1.0",
    generatedAt: new Date().toISOString(),
  };

  // Fetch GA4 metrics if connected
  if (ga4DataSource?.external_account_id) {
    const propertyId = ga4DataSource.external_account_id;

    const [currentMetrics, previousMetrics] = await Promise.all([
      fetchGA4Metrics(ga4DataSource.id, propertyId, currentRange),
      fetchGA4Metrics(ga4DataSource.id, propertyId, previousRange),
    ]);

    snapshotData.ga4 = {
      propertyId,
      propertyName: ga4DataSource.external_account_name ?? propertyId,
      current: currentMetrics,
      previous: previousMetrics,
      changes: {
        sessions: calculateChange(currentMetrics.sessions, previousMetrics.sessions),
        users: calculateChange(currentMetrics.users, previousMetrics.users),
        newUsers: calculateChange(currentMetrics.newUsers, previousMetrics.newUsers),
        pageviews: calculateChange(currentMetrics.pageviews, previousMetrics.pageviews),
        avgSessionDuration: calculateChange(
          currentMetrics.avgSessionDuration,
          previousMetrics.avgSessionDuration
        ),
        bounceRate: calculateChange(currentMetrics.bounceRate, previousMetrics.bounceRate),
      },
    };
  }

  // Save snapshot data to storage
  const storagePath = await saveSnapshotData(clientId, snapshotDate, snapshotData as unknown as Record<string, unknown>);

  // Create metrics summary for quick access
  const metricsSummary: Record<string, number> = {};
  if (snapshotData.ga4) {
    metricsSummary.sessions = snapshotData.ga4.current.sessions;
    metricsSummary.users = snapshotData.ga4.current.users;
    metricsSummary.pageviews = snapshotData.ga4.current.pageviews;
  }

  // Upsert snapshot record in database
  if (existing) {
    await db
      .updateTable("snapshots")
      .set({
        storage_path: storagePath,
        metrics_summary: metricsSummary,
        template_version: "1.0",
      })
      .where("id", "=", existing.id)
      .execute();

    const snapshot = await db
      .selectFrom("snapshots")
      .selectAll()
      .where("id", "=", existing.id)
      .executeTakeFirstOrThrow();

    return {
      id: snapshot.id,
      clientId: snapshot.client_id,
      snapshotDate: snapshot.snapshot_date.toISOString().split("T")[0]!,
      templateVersion: snapshot.template_version,
      hasPdf: !!snapshot.pdf_storage_path,
      metricsSummary: snapshot.metrics_summary as Record<string, number>,
      createdAt: snapshot.created_at,
    };
  }

  // Create new snapshot record
  const snapshot = await db
    .insertInto("snapshots")
    .values({
      client_id: clientId,
      snapshot_date: new Date(snapshotDate),
      template_version: "1.0",
      storage_path: storagePath,
      metrics_summary: metricsSummary,
      expires_at: new Date(Date.now() + 24 * 30 * 24 * 60 * 60 * 1000), // 24 months
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    id: snapshot.id,
    clientId: snapshot.client_id,
    snapshotDate: snapshot.snapshot_date.toISOString().split("T")[0]!,
    templateVersion: snapshot.template_version,
    hasPdf: false,
    metricsSummary: snapshot.metrics_summary as Record<string, number>,
    createdAt: snapshot.created_at,
  };
}

/**
 * List snapshots for a client
 */
export async function listSnapshots(
  clientId: string,
  userId: string,
  limit = 12,
  offset = 0
): Promise<{ snapshots: SnapshotSummary[]; total: number }> {
  const db = getDb();

  // Verify client ownership
  const client = await db
    .selectFrom("clients")
    .select("id")
    .where("id", "=", clientId)
    .where("created_by", "=", userId)
    .executeTakeFirst();

  if (!client) {
    throw new NotFoundError("Client not found");
  }

  const [snapshots, countResult] = await Promise.all([
    db
      .selectFrom("snapshots")
      .selectAll()
      .where("client_id", "=", clientId)
      .orderBy("snapshot_date", "desc")
      .limit(limit)
      .offset(offset)
      .execute(),
    db
      .selectFrom("snapshots")
      .select(db.fn.count("id").as("count"))
      .where("client_id", "=", clientId)
      .executeTakeFirst(),
  ]);

  return {
    snapshots: snapshots.map((s) => ({
      id: s.id,
      clientId: s.client_id,
      snapshotDate: s.snapshot_date.toISOString().split("T")[0]!,
      templateVersion: s.template_version,
      hasPdf: !!s.pdf_storage_path,
      metricsSummary: s.metrics_summary as Record<string, number>,
      createdAt: s.created_at,
    })),
    total: Number(countResult?.count ?? 0),
  };
}

/**
 * Get snapshot data
 */
export async function getSnapshotData(
  snapshotId: string,
  userId: string
): Promise<SnapshotData> {
  const db = getDb();

  const snapshot = await db
    .selectFrom("snapshots")
    .innerJoin("clients", "clients.id", "snapshots.client_id")
    .select([
      "snapshots.id",
      "snapshots.client_id",
      "snapshots.snapshot_date",
      "snapshots.storage_path",
    ])
    .where("snapshots.id", "=", snapshotId)
    .where("clients.created_by", "=", userId)
    .executeTakeFirst();

  if (!snapshot) {
    throw new NotFoundError("Snapshot not found");
  }

  const data = snapshot.storage_path
    ? await loadSnapshotDataFromPath(snapshot.storage_path)
    : await loadSnapshotData(
        snapshot.client_id,
        snapshot.snapshot_date.toISOString().split("T")[0]!
      );

  return data as unknown as SnapshotData;
}

/**
 * Get snapshot record by ID
 */
export async function getSnapshot(
  snapshotId: string,
  userId: string
): Promise<SnapshotSummary> {
  const db = getDb();

  const snapshot = await db
    .selectFrom("snapshots")
    .innerJoin("clients", "clients.id", "snapshots.client_id")
    .select([
      "snapshots.id",
      "snapshots.client_id",
      "snapshots.snapshot_date",
      "snapshots.template_version",
      "snapshots.pdf_storage_path",
      "snapshots.metrics_summary",
      "snapshots.created_at",
    ])
    .where("snapshots.id", "=", snapshotId)
    .where("clients.created_by", "=", userId)
    .executeTakeFirst();

  if (!snapshot) {
    throw new NotFoundError("Snapshot not found");
  }

  return {
    id: snapshot.id,
    clientId: snapshot.client_id,
    snapshotDate: snapshot.snapshot_date.toISOString().split("T")[0]!,
    templateVersion: snapshot.template_version,
    hasPdf: !!snapshot.pdf_storage_path,
    metricsSummary: snapshot.metrics_summary as Record<string, number>,
    createdAt: snapshot.created_at,
  };
}
