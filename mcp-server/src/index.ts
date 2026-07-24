#!/usr/bin/env node
/**
 * UBC Length Swim — MCP Server
 *
 * Exposes swim session management as Claude tools.
 *
 * Required env vars:
 *   SWIM_API_BASE   Backend URL, e.g. https://your-app.railway.app  (default: http://localhost:8080)
 *   SWIM_TOKEN      JWT token from the app (Settings → open DevTools → localStorage → "token")
 *
 * Quick start:
 *   npm install && npm run build
 *   SWIM_API_BASE=http://localhost:8080 SWIM_TOKEN=<your-token> node dist/index.js
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/* ─── config ────────────────────────────────────────────────────────────── */

const API_BASE = (process.env.SWIM_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
const TOKEN = process.env.SWIM_TOKEN ?? "";

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (TOKEN) h["Authorization"] = `Bearer ${TOKEN}`;
  return h;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: headers() });
  return res;
}

/* ─── types (mirrors the backend) ──────────────────────────────────────── */

interface SwimRecord {
  id: number;
  character: string;
  poolLength: 25 | 50;
  lane: number;
  distanceMeters: number | null;
  startedAt: string;
  completedAt: string | null;
  userId?: number | null;
}

/* ─── helpers ───────────────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "in progress";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function recordLine(r: SwimRecord): string {
  const status = r.completedAt ? "✅" : "🏊 IN PROGRESS";
  const dist = r.distanceMeters != null ? `${r.distanceMeters}m` : "—";
  const dur = fmtDuration(r.startedAt, r.completedAt);
  return `  [${r.id}] ${status}  ${r.poolLength}m pool · Lane ${r.lane} · ${dist} · ${dur} · ${fmtDate(r.startedAt)}`;
}

/* ─── server ────────────────────────────────────────────────────────────── */

const server = new Server(
  { name: "swim-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

/* ── tool list ── */

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_swim_records",
      description:
        "Fetch all of your swim records (completed and in-progress). " +
        "Returns a readable summary with totals, plus per-record details including " +
        "the record ID you'll need for end_swim or delete_swim_record.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "start_swim",
      description:
        "Start a new swim session at the UBC Aquatic Centre. " +
        "A free lane is assigned automatically if you don't specify one. " +
        "Returns the new record's ID (use it with end_swim when you're done).",
      inputSchema: {
        type: "object",
        properties: {
          character: {
            type: "string",
            description:
              "Character ID to swim as. Available IDs: alex, morgan, taylor, jordan, sam, riley, casey, avery",
          },
          poolLength: {
            type: "number",
            enum: [25, 50],
            description: "Pool length in metres — 25 (Recreation Pool) or 50 (Competition Pool)",
          },
          lane: {
            type: "number",
            description: "Lane number 1–10 (optional, auto-assigned if omitted)",
          },
        },
        required: ["character", "poolLength"],
      },
    },
    {
      name: "end_swim",
      description:
        "Finish an in-progress swim session and record how far you swam. " +
        "Use list_swim_records first if you need to look up the record ID.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "Swim record ID (from list_swim_records)",
          },
          distanceMeters: {
            type: "number",
            description: "Total distance swum in metres (e.g. 1500 for a 1.5 km swim)",
          },
        },
        required: ["id", "distanceMeters"],
      },
    },
    {
      name: "delete_swim_record",
      description: "Permanently delete a swim record. This cannot be undone.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "Swim record ID to delete",
          },
        },
        required: ["id"],
      },
    },
  ],
}));

/* ── tool calls ── */

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    /* ---- list_swim_records ---- */
    case "list_swim_records": {
      const res = await api("/api/swim-records");
      if (!res.ok) throw new Error(`Backend error ${res.status}: ${await res.text()}`);

      const records = (await res.json()) as SwimRecord[];

      if (records.length === 0) {
        return { content: [{ type: "text", text: "No swim records yet. Start a swim with start_swim!" }] };
      }

      const completed = records.filter((r) => r.distanceMeters != null);
      const inProgress = records.filter((r) => r.completedAt == null);
      const totalDist = completed.reduce((s, r) => s + (r.distanceMeters ?? 0), 0);
      const longest = completed.reduce(
        (best, r) => ((r.distanceMeters ?? 0) > (best?.distanceMeters ?? 0) ? r : best),
        completed[0],
      );

      const lines = [
        `📊 Swim Summary`,
        `   ${records.length} total swim${records.length !== 1 ? "s" : ""} · ${totalDist}m logged · longest: ${longest?.distanceMeters ?? 0}m`,
        inProgress.length > 0 ? `   ⚠️  ${inProgress.length} in-progress — finish with end_swim` : "",
        "",
        "Records (most recent first):",
        ...records.map(recordLine),
      ]
        .filter((l) => l !== undefined)
        .join("\n");

      return { content: [{ type: "text", text: lines }] };
    }

    /* ---- start_swim ---- */
    case "start_swim": {
      const { character, poolLength, lane } = args as {
        character: string;
        poolLength: 25 | 50;
        lane?: number;
      };

      const res = await api("/api/swim-records", {
        method: "POST",
        body: JSON.stringify({ character, poolLength, lane }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Couldn't start swim (${res.status}): ${msg}`);
      }

      const record = (await res.json()) as SwimRecord;
      return {
        content: [
          {
            type: "text",
            text: [
              `🏊 Swim started! Record ID: ${record.id}`,
              `   Pool: ${record.poolLength}m · Lane: ${record.lane}`,
              `   Started: ${fmtDate(record.startedAt)}`,
              `   When you're done, call end_swim with id=${record.id} and your distance.`,
            ].join("\n"),
          },
        ],
      };
    }

    /* ---- end_swim ---- */
    case "end_swim": {
      const { id, distanceMeters } = args as { id: number; distanceMeters: number };

      const res = await api(`/api/swim-records/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ distanceMeters }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Couldn't end swim ${id} (${res.status}): ${msg}`);
      }

      const record = (await res.json()) as SwimRecord;
      return {
        content: [
          {
            type: "text",
            text: [
              `✅ Swim complete!`,
              `   Distance: ${record.distanceMeters}m`,
              `   Duration: ${fmtDuration(record.startedAt, record.completedAt)}`,
              `   Pool: ${record.poolLength}m · Lane: ${record.lane}`,
            ].join("\n"),
          },
        ],
      };
    }

    /* ---- delete_swim_record ---- */
    case "delete_swim_record": {
      const { id } = args as { id: number };

      const res = await api(`/api/swim-records/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Couldn't delete record ${id} (${res.status})`);

      return { content: [{ type: "text", text: `🗑 Record ${id} deleted.` }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

/* ─── start ─────────────────────────────────────────────────────────────── */

async function main() {
  if (!TOKEN) {
    console.error("[swim-mcp] Warning: SWIM_TOKEN is not set — API calls that require auth will return empty results.");
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[swim-mcp] Running — connected to ${API_BASE}`);
}

main().catch((err) => {
  console.error("[swim-mcp] Fatal:", err);
  process.exit(1);
});
