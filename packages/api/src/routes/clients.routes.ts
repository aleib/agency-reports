import type { FastifyInstance } from "fastify";
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
} from "../services/client.service.js";
import { createClientSchema, updateClientSchema } from "../lib/validation.js";
import { ValidationError } from "../lib/errors.js";

export async function clientRoutes(fastify: FastifyInstance) {
  // All client routes require authentication
  fastify.addHook("onRequest", fastify.authenticate);

  // GET /clients - List all clients
  fastify.get("/clients", async (request) => {
    const clients = await listClients(request.userId);
    return { clients };
  });

  // GET /clients/:id - Get single client
  fastify.get<{ Params: { id: string } }>("/clients/:id", async (request) => {
    const client = await getClient(request.params.id, request.userId);
    return { client };
  });

  // POST /clients - Create client
  fastify.post("/clients", async (request, reply) => {
    const parsed = createClientSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed");
    }

    const client = await createClient(parsed.data, request.userId);

    reply.status(201);
    return {
      client: {
        id: client.id,
        name: client.name,
        primaryDomain: client.primary_domain,
        timezone: client.timezone,
        contactEmails: client.contact_emails,
        createdAt: client.created_at,
      },
    };
  });

  // PUT /clients/:id - Update client
  fastify.put<{ Params: { id: string } }>("/clients/:id", async (request) => {
    const parsed = updateClientSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed");
    }

    const client = await updateClient(request.params.id, parsed.data, request.userId);

    return {
      client: {
        id: client.id,
        name: client.name,
        primaryDomain: client.primary_domain,
        timezone: client.timezone,
        contactEmails: client.contact_emails,
        updatedAt: client.updated_at,
      },
    };
  });

  // DELETE /clients/:id - Delete client
  fastify.delete<{ Params: { id: string } }>("/clients/:id", async (request, reply) => {
    await deleteClient(request.params.id, request.userId);
    reply.status(204);
  });
}
