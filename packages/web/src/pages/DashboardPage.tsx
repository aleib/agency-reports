import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { ClientListItem } from "@agency-reports/shared";
import { Layout } from "../components/Layout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Spinner } from "../components/ui/Spinner";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";

export function DashboardPage() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const { clients } = await api.getClients();
      setClients(clients);
    } catch (err) {
      setError("Failed to load clients");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClientCreated = (client: ClientListItem) => {
    setClients([client, ...clients]);
    setShowAddModal(false);
  };

  return (
    <Layout>
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600 mt-1">
            Manage your clients and generate reports
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Client
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
      )}

      {/* Empty State */}
      {!isLoading && !error && clients.length === 0 && (
        <Card className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No clients yet
          </h3>
          <p className="mt-2 text-gray-600">
            Get started by adding your first client.
          </p>
          <Button className="mt-4" onClick={() => setShowAddModal(true)}>
            Add Client
          </Button>
        </Card>
      )}

      {/* Client Grid */}
      {!isLoading && clients.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}

      {/* Add Client Modal */}
      <AddClientModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={handleClientCreated}
      />
    </Layout>
  );
}

function ClientCard({ client }: { client: ClientListItem }) {
  const ga4Source = client.dataSources.find(
    (ds) => ds.type === "google_analytics"
  );

  return (
    <Link to={`/clients/${client.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-gray-900">{client.name}</h3>
            {client.primaryDomain && (
              <p className="text-sm text-gray-600">{client.primaryDomain}</p>
            )}
          </div>
          {ga4Source ? (
            <Badge
              variant={ga4Source.status === "active" ? "success" : "warning"}
            >
              GA4 {ga4Source.status}
            </Badge>
          ) : (
            <Badge variant="neutral">No GA4</Badge>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-sm text-gray-600">
          <span>
            Last report:{" "}
            {client.lastReportDate
              ? new Date(client.lastReportDate).toLocaleDateString()
              : "Never"}
          </span>
        </div>
      </Card>
    </Link>
  );
}

interface AddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (client: ClientListItem) => void;
}

function AddClientModal({ isOpen, onClose, onCreated }: AddClientModalProps) {
  const [name, setName] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const { client } = await api.createClient({
        name,
        primaryDomain: primaryDomain || undefined,
      });
      onCreated(client);
      setName("");
      setPrimaryDomain("");
    } catch (err) {
      setError("Failed to create client");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Client"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-client-form"
            isLoading={isSubmitting}
          >
            Create Client
          </Button>
        </>
      }
    >
      <form id="add-client-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Client Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Corp"
          required
        />
        <Input
          label="Primary Domain (optional)"
          value={primaryDomain}
          onChange={(e) => setPrimaryDomain(e.target.value)}
          placeholder="www.acme.com"
        />
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
