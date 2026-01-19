import { google } from "googleapis";
import { saveGa4DebugPayload } from "../services/storage.service.js";
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
  dateRange: DateRange,
  debugContext?: { clientId: string; snapshotDate: string; label: string }
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
        { name: "activeUsers" },
        { name: "engagementRate" },
        { name: "userEngagementDuration" },
      ],
    },
  });

  const mainRow = mainMetricsResponse.data.rows?.[0];
  const mainValues = mainRow?.metricValues ?? [];

  // Fetch daily metrics for sparklines and time series charts
  const dailyMetricsResponse = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "activeUsers" },
        { name: "engagementRate" },
        { name: "userEngagementDuration" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    },
  });

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

  // Fetch top page views by path
  const pageViewsResponse = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: "4",
    },
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

  const topKeyEvents = keyEvents.slice(0, Math.min(4, keyEvents.length));
  const keyEventBreakdownResponses = await Promise.all(
    topKeyEvents.map((event) =>
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
          dimensions: [{ name: "eventName" }, { name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "keyEvents" }],
          dimensionFilter: {
            filter: {
              fieldName: "eventName",
              stringFilter: {
                matchType: "EXACT",
                value: event.name,
              },
            },
          },
          orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }],
          limit: "6",
        },
      })
    )
  );

  const keyEventBreakdowns = keyEventBreakdownResponses.map((response, index) => {
    const eventName = topKeyEvents[index]?.name ?? "Unknown";
    const rows = response.data.rows ?? [];
    const channels = rows
      .map((row) => ({
        name: row.dimensionValues?.[1]?.value ?? "Unknown",
        count: parseFloat(row.metricValues?.[0]?.value ?? "0"),
      }))
      .filter((channel) => channel.count > 0);
    const total = channels.reduce((sum, channel) => sum + channel.count, 0);
    return {
      name: eventName,
      total,
      channels,
    };
  });

  const dailyRows = dailyMetricsResponse.data.rows ?? [];
  const dailyMetrics = dailyRows.map((row) => {
    const metricValues = row.metricValues ?? [];
    const dateValue = row.dimensionValues?.[0]?.value ?? "";
    return {
      date: formatGa4Date(dateValue),
      sessions: parseFloat(metricValues[0]?.value ?? "0"),
      users: parseFloat(metricValues[1]?.value ?? "0"),
      newUsers: parseFloat(metricValues[2]?.value ?? "0"),
      pageviews: parseFloat(metricValues[3]?.value ?? "0"),
      avgSessionDuration: parseFloat(metricValues[4]?.value ?? "0"),
      bounceRate: parseFloat(metricValues[5]?.value ?? "0") * 100,
      activeUsers: parseFloat(metricValues[6]?.value ?? "0"),
      engagementRate: parseFloat(metricValues[7]?.value ?? "0") * 100,
      userEngagementDuration: parseFloat(metricValues[8]?.value ?? "0"),
    };
  });

  const pageViewsRows = pageViewsResponse.data.rows ?? [];
  const topPages = pageViewsRows.map((row) => ({
    path: row.dimensionValues?.[0]?.value ?? "/",
    views: parseFloat(row.metricValues?.[0]?.value ?? "0"),
  }));

  if (process.env.GA4_DEBUG_CAPTURE === "true" && debugContext) {
    await saveGa4DebugPayload(debugContext.clientId, debugContext.snapshotDate, debugContext.label, {
      fetchedAt: new Date().toISOString(),
      propertyId,
      dateRange,
      responses: {
        mainMetrics: mainMetricsResponse.data,
        dailyMetrics: dailyMetricsResponse.data,
        channels: channelResponse.data,
        topPages: pageViewsResponse.data,
        keyEvents: keyEventsResponse.data,
        keyEventBreakdowns: keyEventBreakdownResponses.map((response) => response.data),
      },
    });
  }

  return {
    sessions: parseFloat(mainValues[0]?.value ?? "0"),
    users: parseFloat(mainValues[1]?.value ?? "0"),
    newUsers: parseFloat(mainValues[2]?.value ?? "0"),
    pageviews: parseFloat(mainValues[3]?.value ?? "0"),
    avgSessionDuration: parseFloat(mainValues[4]?.value ?? "0"),
    bounceRate: parseFloat(mainValues[5]?.value ?? "0") * 100, // Convert to percentage
    activeUsers: parseFloat(mainValues[6]?.value ?? "0"),
    engagementRate: parseFloat(mainValues[7]?.value ?? "0") * 100,
    userEngagementDuration: parseFloat(mainValues[8]?.value ?? "0"),
    dailyMetrics,
    topPages,
    channels,
    keyEvents,
    keyEventBreakdowns,
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

function formatGa4Date(dateValue: string): string {
  if (!dateValue || dateValue.length !== 8) return dateValue;
  const year = dateValue.slice(0, 4);
  const month = dateValue.slice(4, 6);
  const day = dateValue.slice(6, 8);
  return `${year}-${month}-${day}`;
}
