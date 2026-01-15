import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import type { ChartConfiguration } from "chart.js";

// Configure canvas for SVG-like quality
const chartWidth = 400;
const chartHeight = 300;

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: chartWidth,
  height: chartHeight,
  backgroundColour: "white",
});

interface ChannelData {
  name: string;
  sessions: number;
  percentage: number;
}

// Color palette for charts
const CHART_COLORS = [
  "#2563eb", // Blue
  "#16a34a", // Green
  "#dc2626", // Red
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#84cc16", // Lime
  "#f97316", // Orange
  "#6366f1", // Indigo
];

/**
 * Render a pie chart for traffic channel distribution
 */
export async function renderChannelsPieChart(channels: ChannelData[]): Promise<string> {
  if (!channels || channels.length === 0) {
    return "";
  }

  // Take top 8 channels, group rest as "Other"
  const topChannels = channels.slice(0, 8);
  const otherChannels = channels.slice(8);

  const labels = topChannels.map((c) => c.name);
  const data = topChannels.map((c) => c.sessions);

  if (otherChannels.length > 0) {
    labels.push("Other");
    data.push(otherChannels.reduce((sum, c) => sum + c.sessions, 0));
  }

  const configuration: ChartConfiguration = {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: CHART_COLORS.slice(0, labels.length),
          borderWidth: 2,
          borderColor: "#ffffff",
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            font: {
              size: 11,
              family:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            },
            padding: 12,
          },
        },
        tooltip: {
          enabled: false,
        },
      },
    },
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

interface MetricComparison {
  label: string;
  current: number;
  previous: number;
}

/**
 * Render a bar chart comparing current vs previous period metrics
 */
export async function renderComparisonChart(
  metrics: MetricComparison[]
): Promise<string> {
  if (!metrics || metrics.length === 0) {
    return "";
  }

  const configuration: ChartConfiguration = {
    type: "bar",
    data: {
      labels: metrics.map((m) => m.label),
      datasets: [
        {
          label: "Current Period",
          data: metrics.map((m) => m.current),
          backgroundColor: "#2563eb",
          borderRadius: 4,
        },
        {
          label: "Previous Period",
          data: metrics.map((m) => m.previous),
          backgroundColor: "#94a3b8",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: {
          position: "top",
          labels: {
            font: {
              size: 11,
              family:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            },
          },
        },
        tooltip: {
          enabled: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: {
              size: 10,
            },
          },
        },
        x: {
          ticks: {
            font: {
              size: 10,
            },
          },
        },
      },
    },
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

/**
 * Build comparison data from GA4 metrics
 */
export function buildComparisonMetrics(
  current: {
    sessions: number;
    users: number;
    pageviews: number;
    newUsers: number;
  },
  previous: {
    sessions: number;
    users: number;
    pageviews: number;
    newUsers: number;
  }
): MetricComparison[] {
  return [
    { label: "Sessions", current: current.sessions, previous: previous.sessions },
    { label: "Users", current: current.users, previous: previous.users },
    { label: "Pageviews", current: current.pageviews, previous: previous.pageviews },
    { label: "New Users", current: current.newUsers, previous: previous.newUsers },
  ];
}
