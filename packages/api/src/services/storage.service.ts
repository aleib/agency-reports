import { promises as fs } from "fs";
import path from "path";

const STORAGE_PATH = process.env.STORAGE_PATH || "./storage";

/**
 * Ensure storage directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore if directory already exists
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

/**
 * Get the storage path for a client's snapshots
 */
function getClientPath(clientId: string): string {
  return path.join(STORAGE_PATH, "snapshots", clientId);
}

/**
 * Get the file path for a specific snapshot
 */
function getSnapshotPath(clientId: string, snapshotDate: string): string {
  return path.join(getClientPath(clientId), snapshotDate);
}

/**
 * Save snapshot JSON data
 */
export async function saveSnapshotData(
  clientId: string,
  snapshotDate: string,
  data: Record<string, unknown>
): Promise<string> {
  const snapshotDir = getSnapshotPath(clientId, snapshotDate);
  await ensureDir(snapshotDir);

  const filePath = path.join(snapshotDir, "snapshot.json");
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));

  return filePath;
}

/**
 * Load snapshot JSON data
 */
export async function loadSnapshotData(
  clientId: string,
  snapshotDate: string
): Promise<Record<string, unknown>> {
  const filePath = path.join(getSnapshotPath(clientId, snapshotDate), "snapshot.json");
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Load snapshot JSON data from a stored file path
 */
export async function loadSnapshotDataFromPath(
  filePath: string
): Promise<Record<string, unknown>> {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Save PDF file
 */
export async function savePdfFile(
  clientId: string,
  snapshotDate: string,
  pdfBuffer: Buffer
): Promise<string> {
  const snapshotDir = getSnapshotPath(clientId, snapshotDate);
  await ensureDir(snapshotDir);

  const filePath = path.join(snapshotDir, "report.pdf");
  await fs.writeFile(filePath, pdfBuffer);

  return filePath;
}

/**
 * Load PDF file
 */
export async function loadPdfFile(
  clientId: string,
  snapshotDate: string
): Promise<Buffer> {
  const filePath = path.join(getSnapshotPath(clientId, snapshotDate), "report.pdf");
  return fs.readFile(filePath);
}

/**
 * Load PDF file from a stored file path
 */
export async function loadPdfFileFromPath(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

/**
 * Check if snapshot exists
 */
export async function snapshotExists(
  clientId: string,
  snapshotDate: string
): Promise<boolean> {
  try {
    const filePath = path.join(getSnapshotPath(clientId, snapshotDate), "snapshot.json");
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete snapshot files
 */
export async function deleteSnapshot(
  clientId: string,
  snapshotDate: string
): Promise<void> {
  const snapshotDir = getSnapshotPath(clientId, snapshotDate);
  await fs.rm(snapshotDir, { recursive: true, force: true });
}

/**
 * List all snapshots for a client
 */
export async function listSnapshots(clientId: string): Promise<string[]> {
  const clientDir = getClientPath(clientId);

  try {
    const entries = await fs.readdir(clientDir);
    return entries.sort().reverse(); // Most recent first
  } catch {
    return [];
  }
}
