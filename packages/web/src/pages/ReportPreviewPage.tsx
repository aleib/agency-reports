import { useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";

export function ReportPreviewPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();
  const month = searchParams.get("month") || getLastMonth();

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);

  useEffect(() => {
    loadPreview();
  }, [clientId, month]);

  const loadPreview = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First, get the snapshot to have its ID for PDF download
      const { snapshots } = await api.getSnapshots(clientId!);
      const snapshot = snapshots.find(
        (s) => s.snapshotDate.startsWith(month)
      );
      if (snapshot) {
        setSnapshotId(snapshot.id);
      }

      // Fetch the preview HTML
      const previewUrl = await api.getReportPreviewUrl(clientId!, month);
      const response = await fetch(previewUrl);
      if (!response.ok) {
        throw new Error("Failed to load preview");
      }
      const html = await response.text();
      setPreviewHtml(html);
    } catch (err) {
      setError("Failed to load report preview. The report may not exist yet.");
    } finally {
      setIsLoading(false);
    }
  };

  const monthLabel = new Date(month + "-01").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to={`/clients/${clientId}`}
            className="text-gray-600 hover:text-gray-900"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </Link>
          <div>
            <h1 className="font-semibold text-gray-900">Report Preview</h1>
            <p className="text-sm text-gray-600">{monthLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {snapshotId && (
            <a
              href={api.getPdfDownloadUrl(snapshotId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button>
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Download PDF
              </Button>
            </a>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" />
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto mt-12">
            <div className="bg-red-50 text-red-700 p-4 rounded-lg text-center">
              {error}
              <div className="mt-4">
                <Link to={`/clients/${clientId}`}>
                  <Button variant="secondary">Back to Client</Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {previewHtml && (
          <div className="bg-white shadow-lg mx-auto max-w-4xl">
            <iframe
              srcDoc={previewHtml}
              className="w-full h-[calc(100vh-8rem)] border-0"
              title="Report Preview"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function getLastMonth(): string {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
