import type { FastifyInstance } from "fastify";
import { registerUser, loginUser, getUserById } from "../services/auth.service.js";
import { registerSchema, loginSchema } from "../lib/validation.js";
import { ValidationError } from "../lib/errors.js";

export async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/register
  fastify.post("/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed");
    }

    const { user } = await registerUser(parsed.data);
    const token = fastify.jwt.sign({ userId: user.id });

    reply.status(201);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  });

  // POST /auth/login
  fastify.post("/auth/login", async (request) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed");
    }

    const { user } = await loginUser(parsed.data);
    const token = fastify.jwt.sign({ userId: user.id });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  });

  // GET /auth/me - Get current user
  fastify.get(
    "/auth/me",
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const user = await getUserById(request.userId);
      if (!user) {
        throw new ValidationError("User not found");
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    }
  );
}
