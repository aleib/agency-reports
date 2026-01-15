import type { FastifyInstance } from "fastify";
import { listGA4Properties } from "../connectors/google-analytics.connector.js";
import {
  decodeState,
  exchangeCodeForTokens,
  generateAuthUrl,
  type OAuthState,
} from "../connectors/google-auth.js";
import { getDb } from "../db/database.js";
import type { DataSourceType } from "../db/types.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

export async function oauthRoutes(fastify: FastifyInstance) {
  // GET /oauth/google/url - Generate OAuth consent URL
  fastify.get<{
    Querystring: { clientId: string; type: string };
  }>("/oauth/google/url", { preHandler: fastify.authenticate }, async (request) => {
    const { clientId, type } = request.query;

    if (!clientId || !type) {
      throw new ValidationError("clientId and type are required");
    }

    if (type !== "google_analytics" && type !== "google_ads") {
      throw new ValidationError("Invalid type. Must be google_analytics or google_ads");
    }

    // Verify client exists and belongs to user
    const db = getDb();
    const client = await db
      .selectFrom("clients")
      .select("id")
      .where("id", "=", clientId)
      .where("created_by", "=", request.userId)
      .executeTakeFirst();

    if (!client) {
      throw new NotFoundError("Client not found");
    }

    const state: OAuthState = {
      clientId,
      type: type as DataSourceType,
      userId: request.userId,
    };

    const url = generateAuthUrl(state);

    return { url };
  });

  // GET /oauth/google/callback - Handle OAuth callback
  fastify.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>("/oauth/google/callback", async (request, reply) => {
    const { code, state, error } = request.query;

    // Base URL for frontend redirect
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    if (error) {
      return reply.redirect(`${frontendUrl}/oauth/error?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return reply.redirect(`${frontendUrl}/oauth/error?error=missing_params`);
    }

    let parsedState: OAuthState;
    try {
      parsedState = decodeState(state);
    } catch {
      return reply.redirect(`${frontendUrl}/oauth/error?error=invalid_state`);
    }

    try {
      if (parsedState.type !== "google_analytics" && parsedState.type !== "google_ads") {
        return reply.redirect(`${frontendUrl}/oauth/error?error=invalid_type`);
      }

      // Exchange code for tokens
      const credentials = await exchangeCodeForTokens(code);

      const db = getDb();

      const client = await db
        .selectFrom("clients")
        .select(["id", "created_by"])
        .where("id", "=", parsedState.clientId)
        .where("created_by", "=", parsedState.userId)
        .executeTakeFirst();

      if (!client) {
        return reply.redirect(`${frontendUrl}/oauth/error?error=client_not_found`);
      }

      // Check if data source already exists
      const existing = await db
        .selectFrom("data_sources")
        .select("id")
        .where("client_id", "=", parsedState.clientId)
        .where("type", "=", parsedState.type)
        .executeTakeFirst();

      if (existing) {
        // Update existing data source
        await db
          .updateTable("data_sources")
          .set({
            credentials_encrypted: JSON.stringify(credentials),
            connected_at: new Date(),
            expires_at: credentials.expiresAt,
            status: "active",
            updated_at: new Date(),
          })
          .where("id", "=", existing.id)
          .execute();
      } else {
        // Create new data source
        await db
          .insertInto("data_sources")
          .values({
            client_id: parsedState.clientId,
            type: parsedState.type,
            credentials_encrypted: JSON.stringify(credentials),
            connected_at: new Date(),
            expires_at: credentials.expiresAt,
            status: "active",
            config: {},
          })
          .execute();
      }

      // Redirect to success page
      return reply.redirect(
        `${frontendUrl}/clients/${parsedState.clientId}?oauth=success&type=${parsedState.type}`
      );
    } catch (err) {
      fastify.log.error(err, "OAuth callback error");
      return reply.redirect(`${frontendUrl}/oauth/error?error=token_exchange_failed`);
    }
  });

  // GET /clients/:clientId/data-sources - List data sources for a client
  fastify.get<{
    Params: { clientId: string };
  }>("/clients/:clientId/data-sources", { preHandler: fastify.authenticate }, async (request) => {
    const { clientId } = request.params;

    const db = getDb();

    // Verify client ownership
    const client = await db
      .selectFrom("clients")
      .select("id")
      .where("id", "=", clientId)
      .where("created_by", "=", request.userId)
      .executeTakeFirst();

    if (!client) {
      throw new NotFoundError("Client not found");
    }

    const dataSources = await db
      .selectFrom("data_sources")
      .select([
        "id",
        "type",
        "external_account_id",
        "external_account_name",
        "connected_at",
        "status",
        "config",
      ])
      .where("client_id", "=", clientId)
      .execute();

    return {
      dataSources: dataSources.map((ds) => ({
        id: ds.id,
        type: ds.type,
        externalAccountId: ds.external_account_id,
        externalAccountName: ds.external_account_name,
        connectedAt: ds.connected_at,
        status: ds.status,
        config: ds.config,
      })),
    };
  });

  // GET /clients/:clientId/data-sources/:id/properties - List GA4 properties
  fastify.get<{
    Params: { clientId: string; id: string };
  }>(
    "/clients/:clientId/data-sources/:id/properties",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { clientId, id } = request.params;

      const db = getDb();

      // Verify client ownership and data source
      const dataSource = await db
        .selectFrom("data_sources")
        .innerJoin("clients", "clients.id", "data_sources.client_id")
        .select(["data_sources.id", "data_sources.type"])
        .where("data_sources.id", "=", id)
        .where("data_sources.client_id", "=", clientId)
        .where("clients.created_by", "=", request.userId)
        .executeTakeFirst();

      if (!dataSource) {
        throw new NotFoundError("Data source not found");
      }

      if (dataSource.type !== "google_analytics") {
        throw new ValidationError("Properties listing only available for Google Analytics");
      }

      const properties = await listGA4Properties(id);

      return { properties };
    }
  );

  // PUT /clients/:clientId/data-sources/:id - Update data source config (select property)
  fastify.put<{
    Params: { clientId: string; id: string };
    Body: { propertyId?: string; propertyName?: string };
  }>(
    "/clients/:clientId/data-sources/:id",
    { preHandler: fastify.authenticate },
    async (request) => {
      const { clientId, id } = request.params;
      const { propertyId, propertyName } = request.body as {
        propertyId?: string;
        propertyName?: string;
      };

      const db = getDb();

      // Verify client ownership and data source
      const dataSource = await db
        .selectFrom("data_sources")
        .innerJoin("clients", "clients.id", "data_sources.client_id")
        .select(["data_sources.id", "data_sources.config"])
        .where("data_sources.id", "=", id)
        .where("data_sources.client_id", "=", clientId)
        .where("clients.created_by", "=", request.userId)
        .executeTakeFirst();

      if (!dataSource) {
        throw new NotFoundError("Data source not found");
      }

      const config = (dataSource.config as Record<string, unknown>) ?? {};
      if (propertyId) config.propertyId = propertyId;
      if (propertyName) config.propertyName = propertyName;

      await db
        .updateTable("data_sources")
        .set({
          external_account_id: propertyId ?? null,
          external_account_name: propertyName ?? null,
          config,
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .execute();

      return { success: true };
    }
  );

  // DELETE /clients/:clientId/data-sources/:id - Disconnect data source
  fastify.delete<{
    Params: { clientId: string; id: string };
  }>(
    "/clients/:clientId/data-sources/:id",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { clientId, id } = request.params;

      const db = getDb();

      // Verify client ownership
      const result = await db
        .deleteFrom("data_sources")
        .using("clients")
        .whereRef("data_sources.client_id", "=", "clients.id")
        .where("data_sources.id", "=", id)
        .where("data_sources.client_id", "=", clientId)
        .where("clients.created_by", "=", request.userId)
        .executeTakeFirst();

      if (result.numDeletedRows === 0n) {
        throw new NotFoundError("Data source not found");
      }

      reply.status(204);
    }
  );
}
