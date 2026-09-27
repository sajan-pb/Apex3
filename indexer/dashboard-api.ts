import "dotenv/config";
import express from "express";
import Database from "better-sqlite3";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * BEL Trust Chain — Audit Dashboard API
 *
 * Simple Express server that reads from the SQLite index
 * and serves audit trail data to the React frontend.
 */

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "bel_audit.db");
const PORT = parseInt(process.env.API_PORT || "3001");

const app = express();
app.use(cors());
app.use(express.json());

function getDB() {
  return new Database(DB_PATH, { readonly: true });
}

// GET /api/events — List all events, newest first
app.get("/api/events", (req, res) => {
  try {
    const db = getDB();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;
    const contractFilter = req.query.contract as string;
    const eventFilter = req.query.event as string;

    let query = "SELECT * FROM events";
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (contractFilter) {
      conditions.push("contract_name = ?");
      params.push(contractFilter);
    }
    if (eventFilter) {
      conditions.push("event_name = ?");
      params.push(eventFilter);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY block_number DESC, log_index DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params);
    const total = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM events${
          conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : ""
        }`
      )
      .get(...params.slice(0, conditions.length)) as { cnt: number };

    db.close();

    res.json({
      events: rows,
      total: total.cnt,
      limit,
      offset,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/events/stats — Event counts by type
app.get("/api/events/stats", (_req, res) => {
  try {
    const db = getDB();
    const stats = db
      .prepare(
        "SELECT contract_name, event_name, COUNT(*) as count FROM events GROUP BY contract_name, event_name ORDER BY count DESC"
      )
      .all();
    db.close();
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/asset/:tokenId — Get all events for a specific asset
app.get("/api/asset/:tokenId", (req, res) => {
  try {
    const db = getDB();
    const tokenId = req.params.tokenId;

    // Search for events where args_json contains the tokenId
    const events = db
      .prepare(
        `SELECT * FROM events
         WHERE contract_name = 'AssetNFT'
         AND args_json LIKE ?
         ORDER BY block_number ASC, log_index ASC`
      )
      .all(`%"tokenId":"${tokenId}"%`);

    db.close();
    res.json({ tokenId, events });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/credential/:address — Get credential events for an address
app.get("/api/credential/:address", (req, res) => {
  try {
    const db = getDB();
    const address = req.params.address.toLowerCase();

    const events = db
      .prepare(
        `SELECT * FROM events
         WHERE contract_name = 'CredentialRegistry'
         AND LOWER(args_json) LIKE ?
         ORDER BY block_number ASC, log_index ASC`
      )
      .all(`%${address}%`);

    db.close();
    res.json({ address, events });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export function startDashboardApi(port = PORT) {
  const server = app.listen(port, () => {
    console.log(`BEL Audit Dashboard API listening on http://localhost:${port}`);
  });
  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Audit Dashboard API already running on port ${port}`);
    } else {
      console.error("Dashboard API error:", err);
    }
  });
  return server;
}

if (process.argv[1]?.includes("dashboard-api")) {
  startDashboardApi();
}
