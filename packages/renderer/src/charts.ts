import type { ChartConfiguration } from "chart.js";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";

const baseFontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 420,
  height: 320,
  backgroundColour: "white",
});

const sparklineCanvas = new ChartJSNodeCanvas({
  width: 140,
  height: 40,
  backgroundColour: "white",
});

const wideChartCanvas = new ChartJSNodeCanvas({
  width: 560,
  height: 220,
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

type ChartCanvas = {
  ctx: {
    save: () => void;
    restore: () => void;
    textAlign: string;
    textBaseline: string;
    fillStyle: string;
    font: string;
    fillText: (text: string, x: number, y: number) => void;
  };
  width: number;
  height: number;
};

function createCenterTextPlugin(centerText: string, subText?: string) {
  return {
    id: "centerText",
    beforeDraw: (chart: ChartCanvas) => {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#374151";
      ctx.font = "600 18px " + baseFontFamily;
      ctx.fillText(centerText, width / 2, height / 2 - (subText ? 6 : 0));
      if (subText) {
        ctx.fillStyle = "#9ca3af";
        ctx.font = "500 11px " + baseFontFamily;
        ctx.fillText(subText, width / 2, height / 2 + 12);
      }
      ctx.restore();
    },
  };
}

/**
 * Render a pie chart for traffic channel distribution
 */
export async function renderChannelsPieChart(
  channels: ChannelData[],
  totalSessions: number
): Promise<string> {
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

  const configuration = {
    type: "doughnut",
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
      cutout: "65%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            font: {
              size: 11,
              family: baseFontFamily,
            },
            padding: 12,
          },
        },
        tooltip: {
          enabled: false,
        },
      },
    },
    plugins: [createCenterTextPlugin(String(totalSessions), "Sessions")],
  } as ChartConfiguration;

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

export async function renderSparklineChart(
  series: number[],
  color: string
): Promise<string> {
  if (!series || series.length === 0) {
    return "";
  }

  const configuration: ChartConfiguration<"line"> = {
    type: "line",
    data: {
      labels: series.map((_, index) => index + 1),
      datasets: [
        {
          data: series,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
          fill: false,
        },
      ],
    },
    options: {
      responsive: false,
      scales: {
        x: {
          display: false,
        },
        y: {
          display: false,
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: false,
        },
      },
    },
  };

  const buffer = await sparklineCanvas.renderToBuffer(configuration);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

export async function renderTimeSeriesChart({
  labels,
  current,
  previous,
  color,
  fill,
}: {
  labels: string[];
  current: number[];
  previous: number[];
  color: string;
  fill?: boolean;
}): Promise<string> {
  if (!labels.length) {
    return "";
  }

  const configuration: ChartConfiguration<"line"> = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Current",
          data: current,
          borderColor: color,
          backgroundColor: fill ? "rgba(245, 158, 11, 0.25)" : "transparent",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
          fill: fill ? "origin" : false,
        },
        {
          label: "Previous",
          data: previous,
          borderColor: "rgba(245, 158, 11, 0.35)",
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
          fill: false,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: false,
        },
      },
      scales: {
        x: {
          grid: {
            color: "#f3f4f6",
          },
          ticks: {
            font: {
              size: 10,
              family: baseFontFamily,
            },
            maxTicksLimit: 4,
          },
        },
        y: {
          grid: {
            color: "#f3f4f6",
          },
          ticks: {
            font: {
              size: 10,
              family: baseFontFamily,
            },
          },
        },
      },
    },
  };

  const buffer = await wideChartCanvas.renderToBuffer(configuration);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

export async function renderDonutChart({
  labels,
  data,
  centerText,
  centerSubtext,
}: {
  labels: string[];
  data: number[];
  centerText: string;
  centerSubtext?: string;
}): Promise<string> {
  if (!labels.length || !data.length) {
    return "";
  }

  const configuration = {
    type: "doughnut",
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
      cutout: "70%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            font: {
              size: 10,
              family: baseFontFamily,
            },
            padding: 10,
          },
        },
        tooltip: {
          enabled: false,
        },
      },
    },
    plugins: [createCenterTextPlugin(centerText, centerSubtext)],
  } as ChartConfiguration;

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
