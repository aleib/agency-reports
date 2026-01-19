// Database entity types

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "admin";
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  id: string;
  name: string;
  primaryDomain: string | null;
  timezone: string;
  contactEmails: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DataSourceType = "google_analytics" | "google_ads" | "rank_tracker";
export type DataSourceStatus = "active" | "expired" | "disconnected";

export interface DataSource {
  id: string;
  clientId: string;
  type: DataSourceType;
  externalAccountId: string | null;
  externalAccountName: string | null;
  credentialsEncrypted: string | null;
  connectedAt: Date;
  expiresAt: Date | null;
  status: DataSourceStatus;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Snapshot {
  id: string;
  clientId: string;
  snapshotDate: Date;
  templateVersion: string;
  storagePath: string;
  pdfStoragePath: string | null;
  metricsSummary: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date | null;
}

export type JobType = "snapshot" | "render" | "email" | "full_report";
export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Job {
  id: string;
  clientId: string;
  snapshotId: string | null;
  type: JobType;
  status: JobStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// API request/response types

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface CreateClientRequest {
  name: string;
  primaryDomain?: string;
  timezone?: string;
  contactEmails?: string[];
}

export interface UpdateClientRequest {
  name?: string;
  primaryDomain?: string;
  timezone?: string;
  contactEmails?: string[];
}

export interface ClientListItem {
  id: string;
  name: string;
  primaryDomain: string | null;
  timezone: string;
  contactEmails: string[];
  dataSources: Array<{ type: DataSourceType; status: DataSourceStatus }>;
  lastReportDate: string | null;
  createdAt: string;
}

export interface ClientDetail extends ClientListItem {
  recentSnapshots: Array<{
    id: string;
    snapshotDate: string;
    pdfStoragePath: string | null;
    createdAt: string;
  }>;
}

// GA4 Metrics types (for snapshot data)

export interface GA4Metrics {
  sessions: number;
  users: number;
  newUsers: number;
  pageviews: number;
  avgSessionDuration: number;
  bounceRate: number;
  activeUsers: number;
  engagementRate: number;
  userEngagementDuration: number;
  dailyMetrics: Array<{
    date: string;
    sessions: number;
    users: number;
    newUsers: number;
    pageviews: number;
    avgSessionDuration: number;
    bounceRate: number;
    activeUsers: number;
    engagementRate: number;
    userEngagementDuration: number;
  }>;
  topPages: Array<{
    path: string;
    views: number;
  }>;
  channels: Array<{
    name: string;
    sessions: number;
    users: number;
    percentage: number;
  }>;
  keyEvents: Array<{
    name: string;
    count: number;
  }>;
  keyEventBreakdowns: Array<{
    name: string;
    total: number;
    channels: Array<{
      name: string;
      count: number;
    }>;
  }>;
}

export interface SnapshotData {
  clientId: string;
  clientName: string;
  snapshotDate: string;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  templateVersion: string;
  generatedAt: string;
  ga4?: {
    current: GA4Metrics;
    previous: GA4Metrics;
    changes: {
      sessions: number;
      users: number;
      newUsers: number;
      pageviews: number;
      avgSessionDuration: number;
      bounceRate: number;
      activeUsers: number;
      engagementRate: number;
      userEngagementDuration: number;
    };
  };
}

// API Error type

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
