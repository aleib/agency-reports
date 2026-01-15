import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { getDb, closeDb } from "./db/database.js";

// Load environment variables
dotenv.config();

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

// Health check endpoint
server.get("/health", async () => {
  // Test database connection
  try {
    const db = getDb();
    await db.selectFrom("users").select("id").limit(1).execute();
    return { status: "healthy", database: "connected" };
  } catch {
    return { status: "healthy", database: "not connected" };
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
