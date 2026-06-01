import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createPool() {
  // Example: mysql://user:password@localhost:3306/familis_db
  const connectionString =
    process.env.DATABASE_URL || "mysql://root:Dlsu1234!@localhost:3306/familis_db";

  const url = new URL(connectionString);

  return mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace("/", ""),
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
  });
}

async function tableExists(pool, table) {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureColumn(pool, table, column, definition) {
  if (!(await tableExists(pool, table))) return;
  if (await columnExists(pool, table, column)) return;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function ensureSchemaColumns(pool) {
  const columns = [
    { table: "users", column: "password_hash", definition: "TEXT NULL" },
    { table: "users", column: "role", definition: "ENUM('staff','admin') NOT NULL DEFAULT 'staff'" },
    { table: "users", column: "created_at", definition: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP" },
    { table: "users", column: "last_login", definition: "TIMESTAMP NULL" },
    { table: "kiosk", column: "location", definition: "TEXT NULL" },
    { table: "kiosk", column: "image_url", definition: "TEXT NULL" },
    { table: "kiosk", column: "created_at", definition: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP" },
    { table: "participants", column: "kiosk_id", definition: "INT NULL" },
    { table: "participants", column: "contact_number", definition: "VARCHAR(50) NULL" },
    { table: "participants", column: "gcash_number", definition: "VARCHAR(50) NULL" },
    { table: "participants", column: "age", definition: "INT NULL" },
    { table: "participants", column: "gender", definition: "ENUM('male','female','other') NULL" },
    { table: "participants", column: "photo_url", definition: "TEXT NULL" },
    { table: "participants", column: "created_at", definition: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP" },
    { table: "food_products", column: "image_url", definition: "TEXT NULL" },
    { table: "food_products", column: "created_at", definition: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP" },
    { table: "sessions", column: "kiosk_id", definition: "INT NULL" },
    { table: "sessions", column: "participant_id", definition: "INT NULL" },
    {
      table: "sessions",
      column: "status",
      definition: "ENUM('pending','active','completed','cancelled') NOT NULL DEFAULT 'pending'",
    },
    { table: "sessions", column: "created_at", definition: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP" },
    { table: "frame_logs", column: "frame_image_url", definition: "TEXT NULL" },
    { table: "frame_logs", column: "created_at", definition: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP" },
    { table: "system_logs", column: "created_at", definition: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP" },
    { table: "survey_results", column: "remarks", definition: "TEXT NULL" },
    { table: "survey_results", column: "created_at", definition: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP" },
  ];

  for (const { table, column, definition } of columns) {
    try {
      await ensureColumn(pool, table, column, definition);
    } catch (err) {
      console.warn(`Schema migration skipped for ${table}.${column}:`, err);
    }
  }
}

export async function initDb() {
  const pool = createPool();

  // Run schema.sql (now MySQL dialect) to ensure tables/enums exist
  const schemaPath = path.resolve(__dirname, "../server_database/schema.sql");
  const schemaSql = await readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
  await ensureSchemaColumns(pool);

  // Seed admin user (plaintext demo password hashed with bcrypt; salt is inside the hash)
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  await pool.query(
    `
    INSERT INTO users (username, email, password_hash, role)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      username = VALUES(username),
      password_hash = VALUES(password_hash);
  `,
    ["admin", "admin@familis.com", adminPasswordHash, "admin"]
  );

  /**
   * ------------------------------------------------------------
   * SAMPLE DATA (copy/paste when you want to seed)
   * ------------------------------------------------------------
   * These are intentionally comments so they do NOT auto-insert.
   *
   * They are designed to match `server_database/schema.sql`:
   * - `food_products`
   * - `sessions`
   * - `frame_logs`
   * - `survey_results`
   * - `system_logs`
   *
   * Notes:
   * - Replace hard-coded IDs if your DB already has rows.
   * - `hedonic_score` / `confidence_score` are 0..1.
   * - Survey ratings are 1..9 (converted to /10 in dashboard).
   * - Live FER during Session: run `python backend/6.3/emotion_service.py` (after `pip install -r
   *   backend/6.3/requirements.txt` and training `*.pkl` models). Optional env on the Node server:
   *   `EMOTION_SERVICE_URL` (default http://127.0.0.1:8765). Frames are stored under `server/uploads/frame_logs/`.
   */
  /*
  -- Food products
  INSERT INTO food_products (food_id, name, category) VALUES
    (1, 'Ice Cream', 'dessert'),
    (2, 'Potato Chips', 'snack'),
    (3, 'Orange Juice', 'beverage')
  ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category);

  -- Sessions (one active, two completed, one cancelled)
  INSERT INTO sessions (session_id, user_id, food_id, start_time, end_time, status) VALUES
    (101, 1, 1, '2026-03-10 10:30:00', '2026-03-10 10:45:00', 'completed'),
    (102, 1, 1, '2026-03-11 14:15:00', '2026-03-11 14:30:00', 'completed'),
    (103, 1, 1, '2026-03-12 11:00:00', NULL, 'active'),
    (201, 1, 2, '2026-03-13 09:05:00', '2026-03-13 09:18:00', 'cancelled')
  ON DUPLICATE KEY UPDATE
    user_id = VALUES(user_id),
    food_id = VALUES(food_id),
    start_time = VALUES(start_time),
    end_time = VALUES(end_time),
    status = VALUES(status);

  -- Frame logs (sampled at a few timestamps per session)
  INSERT INTO frame_logs (session_id, timestamp, face_detected, confidence_score, hedonic_score) VALUES
    (101, '2026-03-10 10:30:10', true, 0.82, 0.62),
    (101, '2026-03-10 10:32:30', true, 0.86, 0.71),
    (101, '2026-03-10 10:44:20', true, 0.79, 0.68),
    (102, '2026-03-11 14:15:20', true, 0.91, 0.73),
    (102, '2026-03-11 14:22:05', true, 0.93, 0.78),
    (102, '2026-03-11 14:29:10', true, 0.88, 0.74),
    (103, '2026-03-12 11:00:05', true, 0.77, 0.55),
    (103, '2026-03-12 11:02:10', true, 0.81, 0.60);

  -- Survey results (one per session)
  INSERT INTO survey_results (
    session_id,
    color_rating, flavor_aroma_rating, salt_sweet_rating, texture_rating, final_overall_rating,
    remarks
  ) VALUES
    (101, 7, 8, 7, 6, 8, 'Liked the strawberry flavor.'),
    (102, 6, 7, 6, 7, 7, 'Good overall, slightly too sweet.'),
    (201, 5, 5, 4, 5, 4, 'Not enjoyable.');

  -- System logs (optional)
  INSERT INTO system_logs (session_id, log_type, message) VALUES
    (103, 'info', 'Session started'),
    (103, 'warning', 'Lighting low, confidence may drop');
  */

  return pool;
}

