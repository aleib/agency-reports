import type { SnapshotData } from "./snapshot.service.js";

const RENDERER_URL = process.env.RENDERER_URL || "http://localhost:3001";

/**
 * Render a report from snapshot data
 */
export async function renderReportPdf(data: SnapshotData): Promise<Buffer> {
  const response = await fetch(`${RENDERER_URL}/render/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Renderer error: ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Render a report HTML preview from snapshot data
 */
export async function renderReportPreview(data: SnapshotData): Promise<string> {
  const response = await fetch(`${RENDERER_URL}/render/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Renderer error: ${error}`);
  }

  return response.text();
}

/**
 * Render raw HTML to PDF
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const response = await fetch(`${RENDERER_URL}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ html }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Renderer error: ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Check if renderer service is healthy
 */
export async function checkRendererHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${RENDERER_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
