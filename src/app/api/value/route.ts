import { NextRequest, NextResponse } from "next/server";
import { ValueRequestSchema } from "@/lib/types";
import { runAgent } from "@/lib/agent";
import { buildReport, buildInsufficientCompsReport } from "@/lib/report";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ValueRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid subject property", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { subject } = parsed.data;

  const result = await runAgent(subject);

  if (!result) {
    return NextResponse.json(
      buildInsufficientCompsReport(
        "The agent could not find sufficient comparable sales near this property, even after relaxing search filters. A reliable estimate cannot be produced."
      )
    );
  }

  const report = buildReport(subject, result.output, undefined, result.candidates);
  return NextResponse.json(report);
}
