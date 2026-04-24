/**
 * POST /api/projects/[id]/actions/brief
 *
 * Generates a content brief. Two modes:
 *
 * 1. Classic mode — body `{ actionTitle, promptText, rootCause?, actionDescription? }`.
 *    Used by the existing action-plan flow. Unchanged behaviour.
 *
 * 2. Gap mode (Phase 2-E) — body `{ gap: SourceGap, actionTitle? }`.
 *    Uses source-type-tailored playbook instructions so the brief
 *    matches the shape of the opportunity (pitch, reply, submission,
 *    self-audit, etc.). Falls through to a decent generic brief if
 *    the gap's source_type is null.
 *
 * Both modes consume one brief credit and return `{ brief, credits }`.
 * Gap-mode additionally echoes the normalised gap back so the UI can
 * persist it with the polish_request in a subsequent POST.
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logAiUsage } from "@/lib/ai-usage-logger";
import {
  consumeBriefCredit,
  getProject,
  getProjectBriefCredits,
} from "@/lib/queries";
import type { SourceGap } from "@/lib/types";
import {
  BRIEF_WRITER_BASE,
  deriveActionTitle,
  playbookInstruction,
  renderGapContext,
} from "@/lib/gap-brief-templates";

const CLASSIC_SYSTEM = `You are a senior Content Strategist and Brief Writer specialising in GEO (Generative Engine Optimisation) for the Irish market.

Given an action recommendation from our strategy team, create a detailed content brief that a marketing team or agency can execute immediately.

The brief should include:
1. **Objective** - What this content should achieve for AI visibility
2. **Target prompts** - The specific AI search queries this should help with
3. **Content outline** - Detailed structure with headings and key points
4. **SEO & GEO requirements** - Schema markup, structured data, key entities to mention
5. **Distribution plan** - Where to publish and how to amplify
6. **Success metrics** - How to measure if this worked
7. **Timeline** - Realistic timeline with milestones

Write in a professional but practical tone. Be specific to the brand and Irish market.
Return the brief as clean markdown (no code fences wrapping it).`;

interface ClassicBriefBody {
  actionTitle: string;
  promptText: string;
  rootCause?: string;
  actionDescription?: string;
}

interface GapBriefBody {
  gap: SourceGap;
  actionTitle?: string;
}

type BriefBody = Partial<ClassicBriefBody & GapBriefBody>;

export async function POST(
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

    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-...")
    ) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 503 }
      );
    }

    const body = (await request.json()) as BriefBody;

    const isGapMode = Boolean(body.gap);
    if (
      !isGapMode &&
      (!body.actionTitle || !body.promptText)
    ) {
      return NextResponse.json(
        {
          error:
            "actionTitle and promptText are required (or pass a `gap` object for gap-mode)",
        },
        { status: 400 }
      );
    }
    if (isGapMode) {
      const g = body.gap as SourceGap;
      if (!g.scope || !g.domain) {
        return NextResponse.json(
          {
            error:
              "gap.scope and gap.domain are required",
          },
          { status: 400 }
        );
      }
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const credits = await getProjectBriefCredits(projectId);
    if (credits.effective_remaining === 0) {
      return NextResponse.json(
        {
          error:
            credits.project_cap !== null &&
            credits.project_cap_remaining === 0
              ? "This project has hit its monthly cap. Ask the agency owner to raise it or wait for the reset."
              : "Brief credit limit reached",
          credits,
        },
        { status: 403 }
      );
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let system: string;
    let userMessage: string;
    let echoedGap: SourceGap | null = null;
    let actionTitle: string | undefined;

    if (isGapMode) {
      const gap = body.gap as SourceGap;
      // Make sure captured_at is set — clients sometimes omit it.
      echoedGap = {
        ...gap,
        captured_at: gap.captured_at ?? new Date().toISOString(),
      };
      actionTitle = body.actionTitle ?? deriveActionTitle(echoedGap);
      system = BRIEF_WRITER_BASE + playbookInstruction(echoedGap);
      userMessage = `Brand: ${project.brand_name}
Website: ${project.website_url ?? "not provided"}

You are acting on a specific AI-visibility gap. The facts:
${renderGapContext(echoedGap)}

Brief this gap for the agency team. Name the competitor-advantage clearly — the output is useless without it. Be specific to ${project.brand_name} and the Irish market where relevant.`;
    } else {
      const b = body as ClassicBriefBody;
      actionTitle = b.actionTitle;
      system = CLASSIC_SYSTEM;
      userMessage = `Brand: ${project.brand_name}
Website: ${project.website_url ?? "not provided"}

Visibility gap prompt: "${b.promptText}"
Root cause: ${b.rootCause ?? "Not specified"}

Action to brief:
Title: ${b.actionTitle}
Description: ${b.actionDescription ?? "Not specified"}

Please create a detailed content brief for this action.`;
    }

    const briefStartedAt = Date.now();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
    logAiUsage({
      provider: "anthropic",
      model: response.model ?? "claude-sonnet-4-6",
      feature: "brief",
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      org_id: project.org_id,
      project_id: project.id,
      user_id: user.id,
      duration_ms: Date.now() - briefStartedAt,
      success: true,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No brief response");
    }

    // Commit credit consumption — bumps org pool and per-project cap
    // when the org is on the agency plan. Tolerate failure so the
    // user still gets their brief.
    try {
      await consumeBriefCredit(projectId);
    } catch (err) {
      console.error("Failed to consume brief credit:", err);
    }

    const updatedCredits = await getProjectBriefCredits(projectId);

    return NextResponse.json({
      brief: textBlock.text,
      credits: updatedCredits,
      gap: echoedGap,
      actionTitle,
    });
  } catch (error) {
    console.error("Brief generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate brief" },
      { status: 500 }
    );
  }
}
