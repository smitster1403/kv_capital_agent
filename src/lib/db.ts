import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { SaleRecord } from "./types";

const DB_PATH = process.env.DB_PATH ?? "./data/sales.db";
const resolvedPath = path.resolve(process.cwd(), DB_PATH);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  _db = new Database(resolvedPath);
  _db.pragma("journal_mode = WAL");
  applySchema(_db);
  return _db;
}

export function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id             TEXT PRIMARY KEY,
      community      TEXT NOT NULL,
      city           TEXT NOT NULL,
      latitude       REAL NOT NULL,
      longitude      REAL NOT NULL,
      property_type  TEXT NOT NULL,
      beds           INTEGER NOT NULL,
      baths_full     INTEGER NOT NULL,
      baths_half     INTEGER NOT NULL,
      gla_sqft       REAL NOT NULL,
      lot_size_sqft  REAL,
      year_built     INTEGER NOT NULL,
      condition      INTEGER NOT NULL,
      garage_spaces  INTEGER NOT NULL,
      basement       TEXT NOT NULL,
      sale_date      TEXT NOT NULL,
      sale_price     REAL NOT NULL
    )
  `);
}

// In-memory database for tests: call this instead of getDb() in test files.
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  applySchema(db);
  return db;
}

export function insertSale(db: Database.Database, sale: SaleRecord): void {
  db.prepare(`
    INSERT OR REPLACE INTO sales
      (id, community, city, latitude, longitude, property_type,
       beds, baths_full, baths_half, gla_sqft, lot_size_sqft, year_built,
       condition, garage_spaces, basement, sale_date, sale_price)
    VALUES
      (@id, @community, @city, @latitude, @longitude, @property_type,
       @beds, @baths_full, @baths_half, @gla_sqft, @lot_size_sqft, @year_built,
       @condition, @garage_spaces, @basement, @sale_date, @sale_price)
  `).run(sale);
}

export function getSaleByIdFromDb(
  db: Database.Database,
  id: string
): SaleRecord | undefined {
  return db.prepare("SELECT * FROM sales WHERE id = ?").get(id) as SaleRecord | undefined;
}

export function getSaleById(id: string): SaleRecord | undefined {
  return getSaleByIdFromDb(getDb(), id);
}

export interface QueryFilters {
  property_type?: string;
  saleDateAfter?: string;
  glaMin?: number;
  glaMax?: number;
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
}

export function querySalesFromDb(
  db: Database.Database,
  filters: QueryFilters = {}
): SaleRecord[] {
  const clauses: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.property_type) {
    clauses.push("property_type = @property_type");
    params.property_type = filters.property_type;
  }
  if (filters.saleDateAfter) {
    clauses.push("sale_date >= @saleDateAfter");
    params.saleDateAfter = filters.saleDateAfter;
  }
  if (filters.glaMin !== undefined) {
    clauses.push("gla_sqft >= @glaMin");
    params.glaMin = filters.glaMin;
  }
  if (filters.glaMax !== undefined) {
    clauses.push("gla_sqft <= @glaMax");
    params.glaMax = filters.glaMax;
  }
  if (filters.latMin !== undefined) {
    clauses.push("latitude >= @latMin");
    params.latMin = filters.latMin;
  }
  if (filters.latMax !== undefined) {
    clauses.push("latitude <= @latMax");
    params.latMax = filters.latMax;
  }
  if (filters.lonMin !== undefined) {
    clauses.push("longitude >= @lonMin");
    params.lonMin = filters.lonMin;
  }
  if (filters.lonMax !== undefined) {
    clauses.push("longitude <= @lonMax");
    params.lonMax = filters.lonMax;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM sales ${where} ORDER BY sale_date DESC`)
    .all(params) as SaleRecord[];
}

export function querySales(filters: QueryFilters = {}): SaleRecord[] {
  return querySalesFromDb(getDb(), filters);
}

export function countSales(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as n FROM sales").get() as { n: number };
  return row.n;
}
