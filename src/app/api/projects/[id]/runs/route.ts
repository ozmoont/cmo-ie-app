import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProject, getPrompts, getCompetitors } from "@/lib/queries";
import { executeRun } from "@/lib/run-engine";
import { PLAN_LIMITS, type AIModel } from "@/lib/types";

// POST - trigger a new visibility run with SSE progress streaming
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-...")
    ) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 503 }
      );
    }

    const [project, prompts, competitors] = await Promise.all([
      getProject(projectId),
      getPrompts(projectId),
      getCompetitors(projectId),
    ]);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const activePrompts = prompts.filter((p) => p.is_active);
    if (activePrompts.length === 0) {
      return NextResponse.json(
        { error: "No active prompts to run. Add prompts first." },
        { status: 400 }
      );
    }

    // ── Plan-based cost controls ─────────────────────────────────
    // Enforce runsPerMonth + cap project.models to the plan's max.
    // Both are primary cost throttles: runs/month directly scales the
    // provider bill, and models-per-project multiplies every check.
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organisations")
      .select("plan")
      .eq("id", project.org_id)
      .maybeSingle<{ plan: string }>();
    const plan = (org?.plan ?? "trial") as keyof typeof PLAN_LIMITS;
    const limits = PLAN_LIMITS[plan];

    if (limits.runsPerMonth !== Infinity) {
      const now = new Date();
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      ).toISOString();
      const { count: runsThisMonth } = await admin
        .from("daily_runs")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId)
        .gte("created_at", monthStart);
      if ((runsThisMonth ?? 0) >= limits.runsPerMonth) {
        return NextResponse.json(
          {
            error: `Run limit reached. Your ${plan} plan allows ${limits.runsPerMonth} runs per month. Upgrade for more frequent tracking.`,
            code: "runs_per_month_exceeded",
            plan,
            runs_per_month: limits.runsPerMonth,
            runs_this_month: runsThisMonth,
          },
          { status: 403 }
        );
      }
    }

    // Cap the models array to the plan's max. Users on older plans
    // may have projects seeded with more models than their current
    // tier permits; we trim silently rather than fail — the customer
    // still gets a full run, just narrower. If they complain, the
    // upsell conversation writes itself.
    const cappedModels: AIModel[] =
      limits.models === Infinity
        ? project.models
        : project.models.slice(0, limits.models);
    // Remaining code uses `cappedModels` instead of `project.models`
    // for the executeRun call.

    // Stream progress via SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          await executeRun(
            project,
            activePrompts,
            cappedModels,
            competitors,
            (event) => send(event)
          );
        } catch (err) {
          send({
            type: "error",
            message:
              err instanceof Error ? err.message : "Run failed unexpectedly",
          });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Run trigger error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to execute run",
      },
      { status: 500 }
    );
  }
}

// GET - list recent runs for this project
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: runs } = await supabase
      .from("daily_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("run_date", { ascending: false })
      .limit(30);

    return NextResponse.json({ runs: runs ?? [] });
  } catch (error) {
    console.error("Run list error:", error);
    return NextResponse.json(
      { error: "Failed to list runs" },
      { status: 500 }
    );
  }
}
