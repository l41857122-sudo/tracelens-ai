import { NextResponse } from "next/server";
import { IncidentAnalysisSchema } from "@/lib/analysis";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ incidents: [], storage: "ephemeral" });
  }

  try {
    const rows = await prisma.incident.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, severity: true, status: true, source: true, analysis: true, createdAt: true },
    });
    const incidents = rows.map((row) => ({
      ...row,
      analysis: IncidentAnalysisSchema.parse(row.analysis),
    }));
    return NextResponse.json({ incidents, storage: "postgresql" });
  } catch {
    return NextResponse.json({
      error: "Incident history could not be loaded. Check the PostgreSQL connection and run the Prisma migration.",
    }, { status: 503 });
  }
}
