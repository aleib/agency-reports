import { z } from "zod";

// Auth schemas
export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(255),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// Client schemas
export const createClientSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  primaryDomain: z.string().max(255).optional(),
  timezone: z.string().max(100).default("UTC"),
  contactEmails: z.array(z.string().email()).default([]),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  primaryDomain: z.string().max(255).nullable().optional(),
  timezone: z.string().max(100).optional(),
  contactEmails: z.array(z.string().email()).optional(),
});

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
