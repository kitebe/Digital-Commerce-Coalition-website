import { NextResponse } from "next/server";
import { isCmsAuthenticated } from "../../../../lib/cms/auth";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatPercent(val: number): string {
  if (isNaN(val)) return "0.0%";
  return `${(val * 100).toFixed(1)}%`;
}

const SOURCE_COLORS: Record<string, string> = {
  Direct: "#e11d48",
  "Organic Search": "#be123c",
  "Organic Social": "#f43f5e",
  "Social Media": "#f43f5e",
  Referral: "#fb7185",
  "Referral / Links": "#fb7185",
  Email: "#fda4af",
  "Paid Search": "#9f1239",
  "Cross-network": "#e11d48",
  Unassigned: "#cbd5e1",
};

export async function GET(request: Request) {
  if (!(await isCmsAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") as "7d" | "30d" | "90d") || "30d";
  const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : 30;

  const measurementId =
    process.env.NEXT_PUBLIC_GA_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ||
    "G-R28WH8G0TH";

  const propertyId =
    process.env.GA_PROPERTY_ID ||
    process.env.NEXT_PUBLIC_GA_PROPERTY_ID ||
    "";

  const clientEmail =
    process.env.GA_CLIENT_EMAIL ||
    process.env.FIREBASE_CLIENT_EMAIL ||
    "";

  let privateKey =
    process.env.GA_PRIVATE_KEY ||
    process.env.FIREBASE_PRIVATE_KEY ||
    "";

  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  // If GA_PROPERTY_ID and credentials are fully configured, attempt to query the live GA4 Data API
  if (propertyId && clientEmail && privateKey) {
    try {
      const client = new BetaAnalyticsDataClient({
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
      });

      const propertyPath = `properties/${propertyId.replace(/^properties\//, "")}`;
      const startDate = `${periodDays}daysAgo`;
      const endDate = "today";

      // 1. Overview Totals
      const [overviewReport] = await client.runReport({
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "screenPageViews" },
          { name: "activeUsers" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
      });

      // 2. Trend by Date
      const [trendReport] = await client.runReport({
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "activeUsers" },
        ],
        orderBys: [{ dimension: { orderType: "NUMERIC", dimensionName: "date" } }],
      });

      // 3. Top Pages
      const [pagesReport] = await client.runReport({
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      });

      // 4. Traffic Sources
      const [sourcesReport] = await client.runReport({
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 6,
      });

      // 5. Device Category
      const [devicesReport] = await client.runReport({
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      });

      // Parse Overview
      const overviewRow = overviewReport.rows?.[0]?.metricValues || [];
      const totalViewsNum = parseInt(overviewRow[0]?.value || "0", 10);
      const activeUsersNum = parseInt(overviewRow[1]?.value || "0", 10);
      const avgDurationSec = parseFloat(overviewRow[2]?.value || "0");
      const bounceRateRatio = parseFloat(overviewRow[3]?.value || "0");

      // Parse Trend
      const trendData = (trendReport.rows || []).map((row) => {
        const dStr = row.dimensionValues?.[0]?.value || "";
        let formattedDate = dStr;
        if (dStr.length === 8) {
          const yr = dStr.substring(0, 4);
          const mo = parseInt(dStr.substring(4, 6), 10) - 1;
          const day = parseInt(dStr.substring(6, 8), 10);
          formattedDate = new Date(parseInt(yr, 10), mo, day).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        }
        return {
          date: formattedDate,
          views: parseInt(row.metricValues?.[0]?.value || "0", 10),
          visitors: parseInt(row.metricValues?.[1]?.value || "0", 10),
        };
      });

      // Parse Top Pages
      const topPages = (pagesReport.rows || []).map((row) => {
        const path = row.dimensionValues?.[0]?.value || "/";
        const title = row.dimensionValues?.[1]?.value || path;
        const views = parseInt(row.metricValues?.[0]?.value || "0", 10);
        const pct = totalViewsNum > 0 ? `${Math.round((views / totalViewsNum) * 100)}%` : "0%";
        return { path, title, views, pct };
      });

      // Parse Sources
      const totalSourceSessions = (sourcesReport.rows || []).reduce(
        (acc, r) => acc + parseInt(r.metricValues?.[0]?.value || "0", 10),
        0
      );
      const trafficSources = (sourcesReport.rows || []).map((row) => {
        const name = row.dimensionValues?.[0]?.value || "Direct";
        const count = parseInt(row.metricValues?.[0]?.value || "0", 10);
        const share = totalSourceSessions > 0 ? Math.round((count / totalSourceSessions) * 100) : 0;
        return {
          name,
          share,
          color: SOURCE_COLORS[name] || "#e11d48",
        };
      });

      // Parse Devices
      const totalDeviceUsers = (devicesReport.rows || []).reduce(
        (acc, r) => acc + parseInt(r.metricValues?.[0]?.value || "0", 10),
        0
      );
      const deviceBreakdown = (devicesReport.rows || []).map((row) => {
        const type = (row.dimensionValues?.[0]?.value || "desktop").toLowerCase();
        const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
        const count = parseInt(row.metricValues?.[0]?.value || "0", 10);
        const share = totalDeviceUsers > 0 ? Math.round((count / totalDeviceUsers) * 100) : 0;
        return {
          type: capitalizedType,
          share,
          icon: type === "mobile" ? "📱" : type === "tablet" ? "💻" : "🖥️",
        };
      });

      return NextResponse.json({
        isLive: true,
        status: "live",
        measurementId,
        propertyId,
        period,
        serviceEmail: clientEmail,
        metrics: {
          totalViews: totalViewsNum.toLocaleString(),
          uniqueVisitors: activeUsersNum.toLocaleString(),
          avgDuration: formatDuration(avgDurationSec),
          bounceRate: formatPercent(bounceRateRatio),
          viewsGrowth: "Live GA4",
          visitorsGrowth: "Live GA4",
        },
        trendData,
        topPages,
        trafficSources,
        deviceBreakdown,
      });
    } catch (apiErr: any) {
      console.error("GA Data API Query Error:", apiErr);
      return NextResponse.json({
        isLive: false,
        status: "api_pending",
        errorDetails: apiErr?.message || "Google Analytics API query failed",
        measurementId,
        propertyId,
        period,
        serviceEmail: clientEmail,
        metrics: {
          totalViews: "0",
          uniqueVisitors: "0",
          avgDuration: "0s",
          bounceRate: "0.0%",
          viewsGrowth: "Pending Setup",
          visitorsGrowth: "Pending Setup",
        },
        trendData: [],
        topPages: [],
        trafficSources: [],
        deviceBreakdown: [],
      });
    }
  }

  // When GA_PROPERTY_ID is not configured yet
  return NextResponse.json({
    isLive: false,
    status: "api_pending",
    measurementId,
    propertyId: propertyId || "",
    period,
    serviceEmail: clientEmail,
    setupNotice: "GA_PROPERTY_ID is required to pull live analytics from Google Analytics Data API.",
    metrics: {
      totalViews: "0",
      uniqueVisitors: "0",
      avgDuration: "0s",
      bounceRate: "0.0%",
      viewsGrowth: "Pending GA_PROPERTY_ID",
      visitorsGrowth: "Pending GA_PROPERTY_ID",
    },
    trendData: [],
    topPages: [],
    trafficSources: [],
    deviceBreakdown: [],
  });
}
