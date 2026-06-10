import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT DISTINCT community FROM sales ORDER BY community ASC"
      )
      .all() as { community: string }[];

    return NextResponse.json({ communities: rows.map((r) => r.community) });
  } catch {
    return NextResponse.json({ communities: [] });
  }
}
