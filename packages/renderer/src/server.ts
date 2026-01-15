import Fastify from "fastify";
import puppeteer from "puppeteer";
import Handlebars from "handlebars";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  renderChannelsPieChart,
  renderComparisonChart,
  buildComparisonMetrics,
} from "./charts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = Fastify({
  logger: true,
});

// Load and compile template
let reportTemplate: HandlebarsTemplateDelegate | null = null;
let templateStyles: string = "";

async function loadTemplate(): Promise<void> {
  const templatePath = path.join(__dirname, "templates", "report.hbs");
  const stylesPath = path.join(__dirname, "templates", "styles.css");

  const [templateContent, styles] = await Promise.all([
    fs.readFile(templatePath, "utf-8"),
    fs.readFile(stylesPath, "utf-8"),
  ]);

  templateStyles = styles;
  reportTemplate = Handlebars.compile(templateContent);
}

// Register Handlebars helpers
Handlebars.registerHelper("formatNumber", (value: number) => {
  if (typeof value !== "number" || isNaN(value)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value
  );
});

Handlebars.registerHelper("formatPercent", (value: number) => {
  if (typeof value !== "number" || isNaN(value)) return "0%";
  return `${value.toFixed(1)}%`;
});

Handlebars.registerHelper("formatChange", (value: number) => {
  if (typeof value !== "number" || isNaN(value)) return "0%";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
});

Handlebars.registerHelper(
  "changeClass",
  (value: number, inverted?: boolean) => {
    if (typeof value !== "number" || isNaN(value)) return "neutral";
    // For metrics like bounce rate, lower is better
    const isInverted = inverted === true;
    if (value > 0) return isInverted ? "negative" : "positive";
    if (value < 0) return isInverted ? "positive" : "negative";
    return "neutral";
  }
);

Handlebars.registerHelper("formatDuration", (seconds: number) => {
  if (typeof seconds !== "number" || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
});

// Snapshot data interface
interface SnapshotData {
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
    propertyId: string;
    propertyName: string;
    current: {
      sessions: number;
      users: number;
      newUsers: number;
      pageviews: number;
      avgSessionDuration: number;
      bounceRate: number;
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
    };
    previous: {
      sessions: number;
      users: number;
      newUsers: number;
      pageviews: number;
      avgSessionDuration: number;
      bounceRate: number;
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
    };
    changes: {
      sessions: number;
      users: number;
      newUsers: number;
      pageviews: number;
      avgSessionDuration: number;
      bounceRate: number;
    };
  };
}

// Format period label (e.g., "December 2025")
function formatPeriodLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Render report from snapshot data
server.post<{ Body: { data: SnapshotData } }>(
  "/render/report",
  async (request, reply) => {
    const { data } = request.body;

    if (!data) {
      return reply.status(400).send({ error: "Snapshot data is required" });
    }

    if (!reportTemplate) {
      await loadTemplate();
    }

    // Generate charts if GA4 data exists
    let channelsPieChart = "";
    let comparisonChart = "";

    if (data.ga4) {
      const [pieChart, barChart] = await Promise.all([
        renderChannelsPieChart(data.ga4.current.channels),
        renderComparisonChart(
          buildComparisonMetrics(data.ga4.current, data.ga4.previous)
        ),
      ]);
      channelsPieChart = pieChart;
      comparisonChart = barChart;
    }

    // Prepare template context
    const context = {
      ...data,
      styles: templateStyles,
      periodLabel: formatPeriodLabel(data.snapshotDate),
      generatedAtFormatted: formatDate(data.generatedAt),
      periodStart: formatDate(data.periodStart),
      periodEnd: formatDate(data.periodEnd),
      channelsPieChart,
      comparisonChart,
    };

    // Render HTML
    const html = reportTemplate!(context);

    // Render to PDF
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        margin: {
          top: "20mm",
          right: "20mm",
          bottom: "20mm",
          left: "20mm",
        },
        printBackground: true,
      });

      reply.header("Content-Type", "application/pdf");
      return reply.send(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
);

// Render report as HTML preview (no PDF)
server.post<{ Body: { data: SnapshotData } }>(
  "/render/preview",
  async (request, reply) => {
    const { data } = request.body;

    if (!data) {
      return reply.status(400).send({ error: "Snapshot data is required" });
    }

    if (!reportTemplate) {
      await loadTemplate();
    }

    // Generate charts if GA4 data exists
    let channelsPieChart = "";
    let comparisonChart = "";

    if (data.ga4) {
      const [pieChart, barChart] = await Promise.all([
        renderChannelsPieChart(data.ga4.current.channels),
        renderComparisonChart(
          buildComparisonMetrics(data.ga4.current, data.ga4.previous)
        ),
      ]);
      channelsPieChart = pieChart;
      comparisonChart = barChart;
    }

    // Prepare template context
    const context = {
      ...data,
      styles: templateStyles,
      periodLabel: formatPeriodLabel(data.snapshotDate),
      generatedAtFormatted: formatDate(data.generatedAt),
      periodStart: formatDate(data.periodStart),
      periodEnd: formatDate(data.periodEnd),
      channelsPieChart,
      comparisonChart,
    };

    // Render HTML
    const html = reportTemplate!(context);

    reply.header("Content-Type", "text/html");
    return reply.send(html);
  }
);

// Render raw HTML to PDF (legacy endpoint)
server.post<{ Body: { html: string } }>("/render", async (request, reply) => {
  const { html } = request.body;

  if (!html) {
    return reply.status(400).send({ error: "HTML content is required" });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      },
      printBackground: true,
    });

    reply.header("Content-Type", "application/pdf");
    return reply.send(pdfBuffer);
  } finally {
    await browser.close();
  }
});

// Health check
server.get("/health", async () => {
  return { status: "healthy" };
});

const start = async () => {
  try {
    // Pre-load template
    await loadTemplate();
    server.log.info("Report template loaded");

    const port = parseInt(process.env.RENDERER_PORT || "3001", 10);
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`Renderer service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
