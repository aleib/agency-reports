import type { FastifyInstance } from "fastify";
import { getDb } from "../db/database.js";
import {
  generateSnapshot,
  getSnapshotData,
  type SnapshotData,
} from "../services/snapshot.service.js";
import { renderReportPdf, renderReportPreview } from "../services/render.service.js";
import { savePdfFile, loadPdfFile } from "../services/storage.service.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

export async function reportRoutes(fastify: FastifyInstance) {
  // All report routes require authentication
  fastify.addHook("onRequest", fastify.authenticate);

  /**
   * GET /clients/:clientId/preview?month=YYYY-MM
   * Get HTML preview of the report
   */
  fastify.get<{
    Params: { clientId: string };
    Querystring: { month: string };
  }>("/clients/:clientId/preview", async (request, reply) => {
    const { clientId } = request.params;
    const { month } = request.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new ValidationError("month query parameter must be in YYYY-MM format");
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr!, 10);
    const monthNum = parseInt(monthStr!, 10);

    // Try to get existing snapshot, or generate one
    let snapshotData: SnapshotData;

    const db = getDb();
    const snapshotDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;

    const existing = await db
      .selectFrom("snapshots")
      .select("id")
      .innerJoin("clients", "clients.id", "snapshots.client_id")
      .where("snapshots.client_id", "=", clientId)
      .where("snapshots.snapshot_date", "=", new Date(snapshotDate))
      .where("clients.created_by", "=", request.userId)
      .executeTakeFirst();

    if (existing) {
      snapshotData = await getSnapshotData(existing.id, request.userId);
    } else {
      // Generate snapshot on-the-fly for preview
      const snapshot = await generateSnapshot(clientId, request.userId, year, monthNum);
      snapshotData = await getSnapshotData(snapshot.id, request.userId);
    }

    // Render HTML preview
    const html = await renderReportPreview(snapshotData);

    reply.header("Content-Type", "text/html");
    return reply.send(html);
  });

  /**
   * POST /clients/:clientId/reports?month=YYYY-MM
   * Generate and save PDF report
   */
  fastify.post<{
    Params: { clientId: string };
    Querystring: { month: string; regenerate?: string };
  }>("/clients/:clientId/reports", async (request, reply) => {
    const { clientId } = request.params;
    const { month, regenerate } = request.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new ValidationError("month query parameter must be in YYYY-MM format");
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr!, 10);
    const monthNum = parseInt(monthStr!, 10);

    const shouldRegenerate = regenerate === "true";
    const snapshotDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;

    const db = getDb();

    // Check for existing snapshot
    let snapshotId: string;
    const existing = await db
      .selectFrom("snapshots")
      .select(["id", "pdf_storage_path"])
      .innerJoin("clients", "clients.id", "snapshots.client_id")
      .where("snapshots.client_id", "=", clientId)
      .where("snapshots.snapshot_date", "=", new Date(snapshotDate))
      .where("clients.created_by", "=", request.userId)
      .executeTakeFirst();

    if (existing) {
      // If PDF already exists and not regenerating, return early
      if (existing.pdf_storage_path && !shouldRegenerate) {
        return {
          message: "Report already exists",
          snapshotId: existing.id,
          pdfPath: existing.pdf_storage_path,
        };
      }
      snapshotId = existing.id;
    } else {
      // Generate new snapshot
      const snapshot = await generateSnapshot(clientId, request.userId, year, monthNum);
      snapshotId = snapshot.id;
    }

    // Get snapshot data
    const snapshotData = await getSnapshotData(snapshotId, request.userId);

    // Render PDF
    const pdfBuffer = await renderReportPdf(snapshotData);

    // Save PDF file
    const pdfPath = await savePdfFile(clientId, snapshotDate, pdfBuffer);

    // Update snapshot record with PDF path
    await db
      .updateTable("snapshots")
      .set({ pdf_storage_path: pdfPath })
      .where("id", "=", snapshotId)
      .execute();

    reply.status(201);
    return {
      message: "Report generated successfully",
      snapshotId,
      pdfPath,
    };
  });

  /**
   * GET /snapshots/:snapshotId/pdf
   * Download PDF for a snapshot
   */
  fastify.get<{
    Params: { snapshotId: string };
  }>("/snapshots/:snapshotId/pdf", async (request, reply) => {
    const { snapshotId } = request.params;
    const db = getDb();

    // Get snapshot with ownership check
    const snapshot = await db
      .selectFrom("snapshots")
      .innerJoin("clients", "clients.id", "snapshots.client_id")
      .select([
        "snapshots.id",
        "snapshots.client_id",
        "snapshots.snapshot_date",
        "snapshots.pdf_storage_path",
        "clients.name as client_name",
      ])
      .where("snapshots.id", "=", snapshotId)
      .where("clients.created_by", "=", request.userId)
      .executeTakeFirst();

    if (!snapshot) {
      throw new NotFoundError("Snapshot not found");
    }

    if (!snapshot.pdf_storage_path) {
      throw new NotFoundError("PDF not generated for this snapshot. Generate it first using POST /clients/:id/reports");
    }

    // Load PDF
    const snapshotDate = snapshot.snapshot_date.toISOString().split("T")[0]!;
    const pdfBuffer = await loadPdfFile(snapshot.client_id, snapshotDate);

    // Generate filename
    const clientNameSlug = snapshot.client_name.toLowerCase().replace(/\s+/g, "-");
    const filename = `${clientNameSlug}-report-${snapshotDate}.pdf`;

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(pdfBuffer);
  });
}
