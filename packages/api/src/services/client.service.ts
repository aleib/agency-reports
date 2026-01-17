import { getDb } from "../db/database.js";
import type { Client } from "../db/types.js";
import { NotFoundError } from "../lib/errors.js";
import { deleteClientStorage } from "./storage.service.js";
import type { CreateClientInput, UpdateClientInput } from "../lib/validation.js";

export interface ClientListItem {
  id: string;
  name: string;
  primaryDomain: string | null;
  timezone: string;
  contactEmails: string[];
  dataSources: Array<{ type: string; status: string }>;
  lastReportDate: string | null;
  createdAt: Date;
}

function formatSnapshotDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function listClients(userId: string): Promise<ClientListItem[]> {
  const db = getDb();

  const clients = await db
    .selectFrom("clients")
    .selectAll()
    .where("created_by", "=", userId)
    .orderBy("created_at", "desc")
    .execute();

  // Fetch data sources for all clients
  const clientIds = clients.map((c) => c.id);

  const dataSources =
    clientIds.length > 0
      ? await db
          .selectFrom("data_sources")
          .select(["client_id", "type", "status"])
          .where("client_id", "in", clientIds)
          .execute()
      : [];

  // Fetch latest snapshot dates
  const snapshots =
    clientIds.length > 0
      ? await db
          .selectFrom("snapshots")
          .select(["client_id", "snapshot_date"])
          .where("client_id", "in", clientIds)
          .orderBy("snapshot_date", "desc")
          .execute()
      : [];

  // Group data sources and snapshots by client
  const dataSourcesByClient = new Map<string, Array<{ type: string; status: string }>>();
  for (const ds of dataSources) {
    const existing = dataSourcesByClient.get(ds.client_id) ?? [];
    existing.push({ type: ds.type, status: ds.status });
    dataSourcesByClient.set(ds.client_id, existing);
  }

  const latestSnapshotByClient = new Map<string, Date>();
  for (const snap of snapshots) {
    if (!latestSnapshotByClient.has(snap.client_id)) {
      latestSnapshotByClient.set(snap.client_id, snap.snapshot_date);
    }
  }

  return clients.map((client) => ({
    id: client.id,
    name: client.name,
    primaryDomain: client.primary_domain,
    timezone: client.timezone,
    contactEmails: client.contact_emails,
    dataSources: dataSourcesByClient.get(client.id) ?? [],
    lastReportDate: latestSnapshotByClient.get(client.id)
      ? formatSnapshotDate(latestSnapshotByClient.get(client.id)!)
      : null,
    createdAt: client.created_at,
  }));
}

export async function getClient(id: string, userId: string): Promise<ClientListItem> {
  const db = getDb();

  const client = await db
    .selectFrom("clients")
    .selectAll()
    .where("id", "=", id)
    .where("created_by", "=", userId)
    .executeTakeFirst();

  if (!client) {
    throw new NotFoundError("Client not found");
  }

  const dataSources = await db
    .selectFrom("data_sources")
    .select(["type", "status"])
    .where("client_id", "=", id)
    .execute();

  const latestSnapshot = await db
    .selectFrom("snapshots")
    .select("snapshot_date")
    .where("client_id", "=", id)
    .orderBy("snapshot_date", "desc")
    .limit(1)
    .executeTakeFirst();

  return {
    id: client.id,
    name: client.name,
    primaryDomain: client.primary_domain,
    timezone: client.timezone,
    contactEmails: client.contact_emails,
    dataSources: dataSources.map((ds) => ({ type: ds.type, status: ds.status })),
    lastReportDate: latestSnapshot?.snapshot_date
      ? formatSnapshotDate(latestSnapshot.snapshot_date)
      : null,
    createdAt: client.created_at,
  };
}

export async function createClient(
  input: CreateClientInput,
  userId: string
): Promise<Client> {
  const db = getDb();

  const client = await db
    .insertInto("clients")
    .values({
      name: input.name,
      primary_domain: input.primaryDomain ?? null,
      timezone: input.timezone,
      contact_emails: input.contactEmails,
      created_by: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return client;
}

export async function updateClient(
  id: string,
  input: UpdateClientInput,
  userId: string
): Promise<Client> {
  const db = getDb();

  // Check ownership
  const existing = await db
    .selectFrom("clients")
    .select("id")
    .where("id", "=", id)
    .where("created_by", "=", userId)
    .executeTakeFirst();

  if (!existing) {
    throw new NotFoundError("Client not found");
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.primaryDomain !== undefined) updateData.primary_domain = input.primaryDomain;
  if (input.timezone !== undefined) updateData.timezone = input.timezone;
  if (input.contactEmails !== undefined) updateData.contact_emails = input.contactEmails;

  const client = await db
    .updateTable("clients")
    .set(updateData)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirstOrThrow();

  return client;
}

export async function deleteClient(id: string, userId: string): Promise<void> {
  const db = getDb();

  const existing = await db
    .selectFrom("clients")
    .select("id")
    .where("id", "=", id)
    .where("created_by", "=", userId)
    .executeTakeFirst();

  if (!existing) {
    throw new NotFoundError("Client not found");
  }

  await deleteClientStorage(id);

  await db
    .deleteFrom("clients")
    .where("id", "=", id)
    .where("created_by", "=", userId)
    .executeTakeFirst();
}
