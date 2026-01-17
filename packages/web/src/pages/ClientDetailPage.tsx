import type { ClientDetail } from "@agency-reports/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { api, type SnapshotSummary } from "../lib/api";

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    if (clientId) {
      loadClient();
      loadSnapshots();
    }
  }, [clientId]);

  const loadClient = async () => {
    try {
      const { client } = await api.getClient(clientId!);
      setClient(client);
    } catch {
      setError("Failed to load client");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSnapshots = async () => {
    try {
      const { snapshots } = await api.getSnapshots(clientId!);
      setSnapshots(snapshots);
    } catch {
      // Snapshots might not exist yet
    }
  };

  const handleConnectGA = async () => {
    try {
      const { url } = await api.getGoogleOAuthUrl(clientId!, "google_analytics");
      window.location.href = url;
    } catch {
      setError("Failed to initiate Google OAuth");
    }
  };

  const ga4Source = client?.dataSources.find((ds) => ds.type === "google_analytics");

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      </Layout>
    );
  }

  if (error || !client) {
    return (
      <Layout>
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error || "Client not found"}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Breadcrumb */}
      <nav className="mb-6">
        <Link to="/" className="text-blue-600 hover:underline">
          ← Back to Clients
        </Link>
      </nav>

      {/* Client Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          {client.primaryDomain && <p className="text-gray-600 mt-1">{client.primaryDomain}</p>}
          <p className="text-sm text-gray-500 mt-1">Timezone: {client.timezone}</p>
        </div>
        <Button variant="secondary" onClick={() => setShowEditModal(true)}>
          Edit Client
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Data Sources */}
        <Card>
          <CardHeader>
            <CardTitle>Data Sources</CardTitle>
          </CardHeader>

          <div className="space-y-4">
            {/* Google Analytics */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93s3.06-7.44 7-7.93v15.86zm2-15.86c1.03.13 2 .45 2.87.93H13v-.93zM13 7h5.24c.25.31.48.65.68 1H13V7zm0 3h6.74c.08.33.15.66.19 1H13v-1zm0 3h6.93c-.04.34-.11.67-.19 1H13v-1zm0 3h5.92c-.2.35-.43.69-.68 1H13v-1zm0 3h2.87c-.87.48-1.84.8-2.87.93V19z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Google Analytics</p>
                  <p className="text-sm text-gray-600">
                    {ga4Source ? "GA4 Property connected" : "Not connected"}
                  </p>
                </div>
              </div>
              {ga4Source ? (
                <Badge variant={ga4Source.status === "active" ? "success" : "warning"}>
                  {ga4Source.status}
                </Badge>
              ) : (
                <Button size="sm" onClick={handleConnectGA}>
                  Connect
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Report Generation */}
        <Card>
          <CardHeader>
            <CardTitle>Generate Report</CardTitle>
          </CardHeader>
          <ReportGenerator
            clientId={clientId!}
            hasGA4={!!ga4Source && ga4Source.status === "active"}
            onGenerated={loadSnapshots}
          />
        </Card>
      </div>

      {/* Snapshots List */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Report History</CardTitle>
          </CardHeader>

          {snapshots.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No reports generated yet</p>
          ) : (
            <div className="divide-y divide-gray-200">
              {snapshots.map((snapshot) => (
                <SnapshotRow key={snapshot.id} snapshot={snapshot} clientId={clientId!} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Edit Modal */}
      <EditClientModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        client={client}
        onUpdated={(updated) => {
          setClient({ ...client, ...updated });
          setShowEditModal(false);
        }}
      />
    </Layout>
  );
}

interface ReportGeneratorProps {
  clientId: string;
  hasGA4: boolean;
  onGenerated: () => void;
}

function ReportGenerator({ clientId, hasGA4, onGenerated }: ReportGeneratorProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    now.setMonth(now.getMonth());
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      await api.generateReport(clientId, month);
      setSuccess("Report generated successfully!");
      onGenerated();
    } catch (err) {
      setError("Failed to generate report");
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Report Month</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {!hasGA4 && (
        <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm">
          Connect Google Analytics to generate reports with metrics.
        </div>
      )}

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

      {success && (
        <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">{success}</div>
      )}

      <Button onClick={handleGenerate} isLoading={isGenerating} className="w-full">
        Generate Report
      </Button>
    </div>
  );
}

interface SnapshotRowProps {
  snapshot: SnapshotSummary;
  clientId: string;
}

function SnapshotRow({ snapshot, clientId }: SnapshotRowProps) {
  const date = new Date(snapshot.snapshotDate);
  const monthLabel = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="flex items-center justify-between py-4 px-2">
      <div>
        <p className="font-medium text-gray-900">{monthLabel}</p>
        <div className="flex gap-4 text-sm text-gray-600">
          {snapshot.metricsSummary.sessions && (
            <span>{snapshot.metricsSummary.sessions.toLocaleString()} sessions</span>
          )}
          {snapshot.metricsSummary.users && (
            <span>{snapshot.metricsSummary.users.toLocaleString()} users</span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Link to={`/clients/${clientId}/preview?month=${snapshot.snapshotDate.slice(0, 7)}`}>
          <Button variant="ghost" size="sm">
            Preview
          </Button>
        </Link>
        {snapshot.hasPdf && (
          <a href={api.getPdfDownloadUrl(snapshot.id)} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              Download PDF
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

interface EditClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: ClientDetail;
  onUpdated: (client: Partial<ClientDetail>) => void;
}

function EditClientModal({ isOpen, onClose, client, onUpdated }: EditClientModalProps) {
  const [name, setName] = useState(client.name);
  const [primaryDomain, setPrimaryDomain] = useState(client.primaryDomain || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(client.name);
    setPrimaryDomain(client.primaryDomain || "");
  }, [client]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await api.updateClient(client.id, {
        name,
        primaryDomain: primaryDomain || undefined,
      });
      onUpdated({ name, primaryDomain: primaryDomain || null });
    } catch {
      setError("Failed to update client");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Client"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-client-form" isLoading={isSubmitting}>
            Save Changes
          </Button>
        </>
      }
    >
      <form id="edit-client-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Client Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Primary Domain"
          value={primaryDomain}
          onChange={(e) => setPrimaryDomain(e.target.value)}
        />
        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
      </form>
    </Modal>
  );
}
