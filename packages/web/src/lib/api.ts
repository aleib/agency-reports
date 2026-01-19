import type {
  ApiError,
  AuthResponse,
  ClientDetail,
  ClientListItem,
  CreateClientRequest,
  DataSourceType,
  LoginRequest,
  RegisterRequest,
  UpdateClientRequest,
} from "@agency-reports/shared";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem("token");
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const hasBody = options.body !== undefined;
    const headers: Record<string, string> = {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: "UNKNOWN_ERROR",
        message: response.statusText,
      }));
      throw new ApiClientError(error.message, error.error, response.status);
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Auth endpoints
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    this.setToken(response.token);
    return response;
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    this.setToken(response.token);
    return response;
  }

  async getMe(): Promise<AuthResponse["user"]> {
    const response = await this.request<{ user: AuthResponse["user"] }>(
      "/auth/me"
    );
    return response.user;
  }

  logout() {
    this.setToken(null);
  }

  // Client endpoints
  async getClients(): Promise<{ clients: ClientListItem[] }> {
    return this.request("/clients");
  }

  async getClient(id: string): Promise<{ client: ClientDetail }> {
    return this.request(`/clients/${id}`);
  }

  async createClient(
    data: CreateClientRequest
  ): Promise<{ client: ClientListItem }> {
    return this.request("/clients", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateClient(
    id: string,
    data: UpdateClientRequest
  ): Promise<{ client: ClientListItem }> {
    return this.request(`/clients/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteClient(id: string): Promise<void> {
    return this.request(`/clients/${id}`, {
      method: "DELETE",
    });
  }

  // OAuth endpoints
  async getGoogleOAuthUrl(
    clientId: string,
    type: DataSourceType
  ): Promise<{ url: string }> {
    const params = new URLSearchParams({ clientId, type });
    return this.request(`/oauth/google/url?${params.toString()}`);
  }

  // Snapshot endpoints
  async getSnapshots(
    clientId: string
  ): Promise<{ snapshots: SnapshotSummary[]; total: number }> {
    return this.request(`/clients/${clientId}/snapshots`);
  }

  async getClientDataSources(
    clientId: string
  ): Promise<{ dataSources: ClientDataSource[] }> {
    return this.request(`/clients/${clientId}/data-sources`);
  }

  async getGa4Properties(
    clientId: string,
    dataSourceId: string
  ): Promise<{ properties: GA4Property[] }> {
    return this.request(`/clients/${clientId}/data-sources/${dataSourceId}/properties`);
  }

  async updateDataSourceProperty(
    clientId: string,
    dataSourceId: string,
    propertyId: string,
    propertyName: string
  ): Promise<{ success: true }> {
    return this.request(`/clients/${clientId}/data-sources/${dataSourceId}`, {
      method: "PUT",
      body: JSON.stringify({ propertyId, propertyName }),
    });
  }

  async generateSnapshot(
    clientId: string,
    month: string,
    regenerate = false
  ): Promise<{ snapshot: SnapshotSummary }> {
    return this.request(`/clients/${clientId}/snapshots`, {
      method: "POST",
      body: JSON.stringify({ month, regenerate }),
    });
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    return this.request(`/snapshots/${snapshotId}`, {
      method: "DELETE",
    });
  }

  // Report endpoints
  async getReportPreviewUrl(clientId: string, month: string): Promise<string> {
    const token = this.getToken();
    return `${API_URL}/clients/${clientId}/preview?month=${month}&token=${token}`;
  }

  async generateReport(
    clientId: string,
    month: string,
    regenerate = false
  ): Promise<{ snapshotId: string; pdfPath: string }> {
    const params = new URLSearchParams({ month });
    if (regenerate) {
      params.set("regenerate", "true");
    }
    return this.request(`/clients/${clientId}/reports?${params.toString()}`, {
      method: "POST",
    });
  }

  getPdfDownloadUrl(snapshotId: string): string {
    const token = this.getToken();
    return `${API_URL}/snapshots/${snapshotId}/pdf?token=${token}`;
  }
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface SnapshotSummary {
  id: string;
  clientId: string;
  snapshotDate: string;
  templateVersion: string;
  hasPdf: boolean;
  metricsSummary: {
    sessions?: number;
    users?: number;
    pageviews?: number;
  };
  createdAt: string;
}

export interface ClientDataSource {
  id: string;
  type: string;
  status: string;
  externalAccountId: string | null;
  externalAccountName: string | null;
  connectedAt: string;
  config: Record<string, unknown>;
}

export interface GA4Property {
  propertyId: string;
  displayName: string;
}

export const api = new ApiClient();
