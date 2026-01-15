import { google } from "googleapis";
import { getAuthenticatedClient } from "./google-auth.js";

export interface GA4Property {
  propertyId: string;
  displayName: string;
}

export interface GA4Metrics {
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
}

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

/**
 * List GA4 properties accessible to the authenticated user
 */
export async function listGA4Properties(dataSourceId: string): Promise<GA4Property[]> {
  const auth = await getAuthenticatedClient(dataSourceId);
  const analyticsAdmin = google.analyticsadmin({ version: "v1beta", auth });

  const response = await analyticsAdmin.accounts.list();
  const accounts = response.data.accounts ?? [];

  const properties: GA4Property[] = [];

  for (const account of accounts) {
    if (!account.name) continue;

    const propsResponse = await analyticsAdmin.properties.list({
      filter: `parent:${account.name}`,
    });

    for (const prop of propsResponse.data.properties ?? []) {
      if (prop.name && prop.displayName) {
        // Extract property ID from name (format: properties/123456789)
        const propertyId = prop.name.replace("properties/", "");
        properties.push({
          propertyId,
          displayName: prop.displayName,
        });
      }
    }
  }

  return properties;
}

/**
 * Fetch GA4 metrics for a date range
 */
export async function fetchGA4Metrics(
  dataSourceId: string,
  propertyId: string,
  dateRange: DateRange
): Promise<GA4Metrics> {
  const auth = await getAuthenticatedClient(dataSourceId);
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });

  // Fetch main metrics
  const mainMetricsResponse = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
      ],
    },
  });

  const mainRow = mainMetricsResponse.data.rows?.[0];
  const mainValues = mainRow?.metricValues ?? [];

  // Fetch channel breakdown
  const channelResponse = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "10",
    },
  });

  const totalSessions = parseFloat(mainValues[0]?.value ?? "0");
  const channelRows = channelResponse.data.rows ?? [];
  const channels = channelRows.map((row) => {
    const channelSessions = parseFloat(row.metricValues?.[0]?.value ?? "0");
    return {
      name: row.dimensionValues?.[0]?.value ?? "Unknown",
      sessions: channelSessions,
      users: parseFloat(row.metricValues?.[1]?.value ?? "0"),
      percentage: totalSessions > 0 ? (channelSessions / totalSessions) * 100 : 0,
    };
  });

  // Fetch key events (conversions)
  const keyEventsResponse = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "keyEvents" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: {
            matchType: "FULL_REGEXP",
            value: ".*", // Get all events, filter by keyEvents metric
          },
        },
      },
      orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }],
      limit: "20",
    },
  });

  const keyEventRows = keyEventsResponse.data.rows ?? [];
  const keyEvents = keyEventRows
    .filter((row) => parseFloat(row.metricValues?.[0]?.value ?? "0") > 0)
    .map((row) => ({
      name: row.dimensionValues?.[0]?.value ?? "Unknown",
      count: parseFloat(row.metricValues?.[0]?.value ?? "0"),
    }));

  return {
    sessions: parseFloat(mainValues[0]?.value ?? "0"),
    users: parseFloat(mainValues[1]?.value ?? "0"),
    newUsers: parseFloat(mainValues[2]?.value ?? "0"),
    pageviews: parseFloat(mainValues[3]?.value ?? "0"),
    avgSessionDuration: parseFloat(mainValues[4]?.value ?? "0"),
    bounceRate: parseFloat(mainValues[5]?.value ?? "0") * 100, // Convert to percentage
    channels,
    keyEvents,
  };
}

/**
 * Calculate percentage change between two values
 */
export function calculateChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Get date range for a specific month
 */
export function getMonthDateRange(year: number, month: number): DateRange {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
}

/**
 * Get previous month date range
 */
export function getPreviousMonthDateRange(year: number, month: number): DateRange {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return getMonthDateRange(prevYear, prevMonth);
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}
