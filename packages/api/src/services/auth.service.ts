import bcrypt from "bcrypt";
import { getDb } from "../db/database.js";
import type { User } from "../db/types.js";
import { ConflictError, UnauthorizedError } from "../lib/errors.js";
import type { RegisterInput, LoginInput } from "../lib/validation.js";

const BCRYPT_ROUNDS = 12;

export interface AuthResult {
  user: Omit<User, "password_hash">;
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const db = getDb();

  // Check if user already exists
  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", input.email.toLowerCase())
    .executeTakeFirst();

  if (existing) {
    throw new ConflictError("User with this email already exists");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // Create user
  const user = await db
    .insertInto("users")
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      password_hash: passwordHash,
      role: "admin",
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  const { password_hash: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword };
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const db = getDb();

  // Find user by email
  const user = await db
    .selectFrom("users")
    .selectAll()
    .where("email", "=", input.email.toLowerCase())
    .executeTakeFirst();

  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  // Verify password
  const validPassword = await bcrypt.compare(input.password, user.password_hash);
  if (!validPassword) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const { password_hash: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword };
}

export async function getUserById(id: string): Promise<Omit<User, "password_hash"> | null> {
  const db = getDb();

  const user = await db
    .selectFrom("users")
    .select(["id", "email", "name", "role", "created_at", "updated_at"])
    .where("id", "=", id)
    .executeTakeFirst();

  return user ?? null;
}
