import crypto from "crypto";
import { google } from "googleapis";
import { getDb } from "../db/database.js";
import type { DataSourceType } from "../db/types.js";

// OAuth2 scopes for Google Analytics
const SCOPES = {
  google_analytics: ["https://www.googleapis.com/auth/analytics.readonly"],
  google_ads: ["https://www.googleapis.com/auth/adwords"],
};

export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface OAuthState {
  clientId: string;
  type: DataSourceType;
  userId: string;
}

function getStateSigningSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET or JWT_SECRET must be configured");
  }
  return secret;
}

function encodeState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getStateSigningSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function decodeState(state: string): OAuthState {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new Error("Invalid OAuth state format");
  }

  const expectedSignature = crypto
    .createHmac("sha256", getStateSigningSecret())
    .update(payload)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");
  if (signatureBuffer.length !== expectedBuffer.length) {
    throw new Error("Invalid OAuth state signature");
  }
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error("Invalid OAuth state signature");
  }

  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  return JSON.parse(decoded) as OAuthState;
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth credentials not configured");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate Google OAuth consent URL
 */
export function generateAuthUrl(state: OAuthState): string {
  const oauth2Client = getOAuth2Client();

  const scopes = SCOPES[state.type as keyof typeof SCOPES];
  if (!scopes) {
    throw new Error(`Unsupported data source type: ${state.type}`);
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: encodeState(state),
    prompt: "consent", // Force consent to get refresh token
  });

  return url;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<OAuthCredentials> {
  const oauth2Client = getOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to get tokens from Google");
  }

  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000); // Default 1 hour

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<OAuthCredentials> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error("Failed to refresh access token");
  }

  const expiresAt = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  return {
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token ?? refreshToken,
    expiresAt,
  };
}

/**
 * Get a valid access token for a data source, refreshing if needed
 */
export async function getValidAccessToken(dataSourceId: string): Promise<string> {
  const db = getDb();

  const dataSource = await db
    .selectFrom("data_sources")
    .select(["id", "credentials_encrypted", "expires_at", "status"])
    .where("id", "=", dataSourceId)
    .executeTakeFirst();

  if (!dataSource || !dataSource.credentials_encrypted) {
    throw new Error("Data source not found or not connected");
  }

  if (dataSource.status !== "active") {
    throw new Error("Data source is not active");
  }

  // Parse stored credentials (in production, these would be encrypted)
  const credentials = JSON.parse(dataSource.credentials_encrypted) as OAuthCredentials;

  // Check if token is expired or about to expire (5 min buffer)
  const now = new Date();
  const expiresAt = new Date(credentials.expiresAt);
  const needsRefresh = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

  if (needsRefresh) {
    // Refresh the token
    const newCredentials = await refreshAccessToken(credentials.refreshToken);

    // Update stored credentials
    await db
      .updateTable("data_sources")
      .set({
        credentials_encrypted: JSON.stringify(newCredentials),
        expires_at: newCredentials.expiresAt,
        updated_at: new Date(),
      })
      .where("id", "=", dataSourceId)
      .execute();

    return newCredentials.accessToken;
  }

  return credentials.accessToken;
}

/**
 * Create an authenticated OAuth2 client for API calls
 */
export async function getAuthenticatedClient(
  dataSourceId: string
): Promise<InstanceType<typeof google.auth.OAuth2>> {
  const accessToken = await getValidAccessToken(dataSourceId);
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}
