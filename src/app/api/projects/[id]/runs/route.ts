import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProject, getPrompts, getCompetitors } from "@/lib/queries";
import { executeRun } from "@/lib/run-engine";

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
            projectId,
            project.brand_name,
            project.website_url,
            activePrompts,
            project.models,
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
