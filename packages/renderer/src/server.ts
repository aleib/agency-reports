import Fastify from "fastify";
import puppeteer from "puppeteer";
import Handlebars from "handlebars";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  renderChannelsPieChart,
  renderDonutChart,
  renderSparklineChart,
  renderTimeSeriesChart,
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

Handlebars.registerHelper("formatDurationHms", (seconds: number) => {
  if (typeof seconds !== "number" || isNaN(seconds)) return "00:00:00";
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")}`;
});

Handlebars.registerHelper("formatDurationWords", (seconds: number) => {
  if (typeof seconds !== "number" || isNaN(seconds)) return "0s";
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
});

Handlebars.registerHelper("formatEventLabel", (value: string) => {
  if (!value) return "Event";
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
    };
    previous: {
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
    };
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

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function normalizeSeries(series: number[], targetLength: number): number[] {
  if (targetLength === 0) return [];
  if (series.length === targetLength) return series;
  if (series.length > targetLength) return series.slice(0, targetLength);
  return [...series, ...Array(targetLength - series.length).fill(0)];
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
    let sessionsTrendChart = "";
    let usersTrendChart = "";
    let sparklineCharts: Record<string, string> = {};
    let keyEventDonuts: Array<{
      name: string;
      total: number;
      chart: string;
    }> = [];
    let pageViewBars: Array<{
      path: string;
      views: number;
      percent: number;
    }> = [];

    if (data.ga4) {
      const currentDaily = data.ga4.current.dailyMetrics ?? [];
      const previousDaily = data.ga4.previous.dailyMetrics ?? [];
      const labels = currentDaily.map((point) => formatShortDate(point.date));

      const sessionsSeries = currentDaily.map((point) => point.sessions);
      const previousSessionsSeries = normalizeSeries(
        previousDaily.map((point) => point.sessions),
        labels.length
      );

      const usersSeries = currentDaily.map((point) => point.users);
      const previousUsersSeries = normalizeSeries(
        previousDaily.map((point) => point.users),
        labels.length
      );

      const [
        pieChart,
        sessionsChart,
        usersChart,
        sessionsSpark,
        bounceSpark,
        pageviewsSpark,
        avgSessionSpark,
        activeUsersSpark,
        newUsersSpark,
        engagementSpark,
        engagementRateSpark,
      ] = await Promise.all([
        renderChannelsPieChart(data.ga4.current.channels, data.ga4.current.sessions),
        renderTimeSeriesChart({
          labels,
          current: sessionsSeries,
          previous: previousSessionsSeries,
          color: "#f59e0b",
        }),
        renderTimeSeriesChart({
          labels,
          current: usersSeries,
          previous: previousUsersSeries,
          color: "#f97316",
          fill: true,
        }),
        renderSparklineChart(sessionsSeries, "#f59e0b"),
        renderSparklineChart(
          currentDaily.map((point) => point.bounceRate),
          "#f59e0b"
        ),
        renderSparklineChart(
          currentDaily.map((point) => point.pageviews),
          "#f59e0b"
        ),
        renderSparklineChart(
          currentDaily.map((point) => point.avgSessionDuration),
          "#f59e0b"
        ),
        renderSparklineChart(
          currentDaily.map((point) => point.activeUsers),
          "#f59e0b"
        ),
        renderSparklineChart(
          currentDaily.map((point) => point.newUsers),
          "#f59e0b"
        ),
        renderSparklineChart(
          currentDaily.map((point) => point.userEngagementDuration),
          "#f59e0b"
        ),
        renderSparklineChart(
          currentDaily.map((point) => point.engagementRate),
          "#f59e0b"
        ),
      ]);

      channelsPieChart = pieChart;
      sessionsTrendChart = sessionsChart;
      usersTrendChart = usersChart;
      sparklineCharts = {
        sessions: sessionsSpark,
        bounceRate: bounceSpark,
        pageviews: pageviewsSpark,
        avgSessionDuration: avgSessionSpark,
        activeUsers: activeUsersSpark,
        newUsers: newUsersSpark,
        userEngagementDuration: engagementSpark,
        engagementRate: engagementRateSpark,
      };

      keyEventDonuts = (
        await Promise.all(
          (data.ga4.current.keyEventBreakdowns ?? []).map(async (event) => ({
            name: event.name,
            total: event.total,
            chart: await renderDonutChart({
              labels: event.channels.map((channel) => channel.name),
              data: event.channels.map((channel) => channel.count),
              centerText: String(event.total),
              centerSubtext: "Key Events",
            }),
          }))
        )
      ).filter((event) => event.chart);

      const topPages = data.ga4.current.topPages ?? [];
      const maxViews = Math.max(...topPages.map((page) => page.views), 0);
      pageViewBars = topPages.map((page) => ({
        path: page.path,
        views: page.views,
        percent: maxViews > 0 ? (page.views / maxViews) * 100 : 0,
      }));
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
      sessionsTrendChart,
      usersTrendChart,
      sparklineCharts,
      keyEventDonuts,
      pageViewBars,
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
