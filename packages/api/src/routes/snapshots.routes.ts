import type { FastifyInstance } from "fastify";
import {
  generateSnapshot,
  listSnapshots,
  getSnapshot,
  getSnapshotData,
  deleteSnapshot,
} from "../services/snapshot.service.js";
import { ValidationError } from "../lib/errors.js";

export async function snapshotRoutes(fastify: FastifyInstance) {
  // All snapshot routes require authentication
  fastify.addHook("onRequest", fastify.authenticate);

  // POST /clients/:clientId/snapshots - Generate a snapshot
  fastify.post<{
    Params: { clientId: string };
    Body: { month: string; regenerate?: boolean };
  }>("/clients/:clientId/snapshots", async (request, reply) => {
    const { clientId } = request.params;
    const { month, regenerate } = request.body as { month: string; regenerate?: boolean };

    // Validate month format (YYYY-MM)
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new ValidationError("month must be in YYYY-MM format");
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr!, 10);
    const monthNum = parseInt(monthStr!, 10);

    if (monthNum < 1 || monthNum > 12) {
      throw new ValidationError("Invalid month");
    }

    // Don't allow future months
    const now = new Date();
    const requestedDate = new Date(year, monthNum - 1);
    if (requestedDate > now) {
      throw new ValidationError("Cannot generate snapshot for future months");
    }

    const snapshot = await generateSnapshot(
      clientId,
      request.userId,
      year,
      monthNum,
      regenerate ?? false
    );

    reply.status(201);
    return { snapshot };
  });

  // GET /clients/:clientId/snapshots - List snapshots for a client
  fastify.get<{
    Params: { clientId: string };
    Querystring: { limit?: string; offset?: string };
  }>("/clients/:clientId/snapshots", async (request) => {
    const { clientId } = request.params;
    const limit = Math.min(parseInt(request.query.limit || "12", 10), 100);
    const offset = parseInt(request.query.offset || "0", 10);

    const result = await listSnapshots(clientId, request.userId, limit, offset);

    return result;
  });

  // GET /snapshots/:id - Get snapshot summary
  fastify.get<{
    Params: { id: string };
  }>("/snapshots/:id", async (request) => {
    const snapshot = await getSnapshot(request.params.id, request.userId);
    return { snapshot };
  });

  // GET /snapshots/:id/data - Get full snapshot data
  fastify.get<{
    Params: { id: string };
  }>("/snapshots/:id/data", async (request) => {
    const data = await getSnapshotData(request.params.id, request.userId);
    return { data };
  });

  // DELETE /snapshots/:id - Delete snapshot
  fastify.delete<{
    Params: { id: string };
  }>("/snapshots/:id", async (request, reply) => {
    await deleteSnapshot(request.params.id, request.userId);
    reply.status(204);
    return reply.send();
  });
}
