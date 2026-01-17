import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";
import { UnauthorizedError } from "../lib/errors.js";

// Extend FastifyRequest to include user
declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

// Extend JWT payload
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { userId: string };
    user: { userId: string };
  }
}

async function authPlugin(fastify: FastifyInstance) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: "7d",
    },
  });

  // Decorator to verify JWT and extract user
  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, _reply: FastifyReply) {
      try {
        const authHeader = request.headers.authorization;
        const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
        const queryToken =
          typeof request.query === "object" &&
          request.query !== null &&
          "token" in request.query
            ? (request.query as Record<string, unknown>).token
            : undefined;
        const token = bearerToken ?? (typeof queryToken === "string" ? queryToken : undefined);

        if (token) {
          const payload = fastify.jwt.verify<{ userId: string }>(token);
          request.userId = payload.userId;
          return;
        }

        await request.jwtVerify();
        request.userId = request.user.userId;
      } catch {
        throw new UnauthorizedError("Invalid or expired token");
      }
    }
  );
}

export default fp(authPlugin, {
  name: "auth",
});

// Type for the authenticate decorator
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
