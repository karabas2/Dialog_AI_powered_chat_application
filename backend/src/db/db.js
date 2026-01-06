import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import "dotenv/config";

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

const dbPath = process.env.DB_PATH || "./data/app.sqlite";
ensureDir(path.dirname(dbPath));

if (process.env.RESET_DB_ON_START === "true") {
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log(`[DB] Reset enabled: deleted ${dbPath}`);
    } else {
      console.log("[DB] Reset enabled: no existing db file");
    }
  } catch (e) {
    console.error("[DB] Reset failed:", e);
  }
}
export const db = new Database(dbPath);

// init schema
const schemaPath = new URL("./schema.sql", import.meta.url);
const schemaSql = fs.readFileSync(schemaPath, "utf-8");
db.exec(schemaSql);

// pragmatic settings
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
