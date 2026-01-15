import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getDb, closeDb } from "./db/database.js";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.routes.js";
import { clientRoutes } from "./routes/clients.routes.js";
import { oauthRoutes } from "./routes/oauth.routes.js";
import { snapshotRoutes } from "./routes/snapshots.routes.js";
import { reportRoutes } from "./routes/reports.routes.js";
import { AppError } from "./lib/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from monorepo root
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transport:
      process.env.NODE_ENV !== "production"
        ? {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
        : undefined,
  },
});

// Register plugins
await server.register(cors, {
  origin: process.env.NODE_ENV === "production" ? false : true,
});

await server.register(authPlugin);

// Error handler
server.setErrorHandler((error: Error & { validation?: unknown }, _request, reply) => {
  server.log.error(error);

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code ?? "ERROR",
      message: error.message,
    });
  }

  // Handle Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: error.message,
    });
  }

  // Default error
  return reply.status(500).send({
    error: "INTERNAL_ERROR",
    message:
      process.env.NODE_ENV === "production"
        ? "An internal error occurred"
        : error.message,
  });
});

// Register routes
await server.register(authRoutes);
await server.register(clientRoutes);
await server.register(oauthRoutes);
await server.register(snapshotRoutes);
await server.register(reportRoutes);

// Health check endpoint
server.get("/health", async () => {
  try {
    const db = getDb();
    await db.selectFrom("users").select("id").limit(1).execute();
    return { status: "healthy", database: "connected" };
  } catch {
    return { status: "degraded", database: "disconnected" };
  }
});

// Root endpoint
server.get("/", async () => {
  return { name: "Agency Reports API", version: "0.1.0" };
});

// Graceful shutdown
const shutdown = async () => {
  server.log.info("Shutting down server...");
  await closeDb();
  await server.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || "3000", 10);
    await server.listen({ port, host: "0.0.0.0" });
    server.log.info(`Server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
