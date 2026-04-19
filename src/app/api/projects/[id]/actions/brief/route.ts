import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProject, getOrgBriefCredits } from "@/lib/queries";

const BRIEF_WRITER_SYSTEM = `You are a senior Content Strategist and Brief Writer specialising in GEO (Generative Engine Optimisation) for the Irish market.

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

    const { actionTitle, actionDescription, promptText, rootCause } =
      await request.json();

    if (!actionTitle || !promptText) {
      return NextResponse.json(
        { error: "actionTitle and promptText are required" },
        { status: 400 }
      );
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check brief credits before generation
    const credits = await getOrgBriefCredits(project.org_id);
    if (credits.remaining === 0) {
      return NextResponse.json(
        {
          error: "Brief credit limit reached",
          credits,
        },
        { status: 403 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: BRIEF_WRITER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Brand: ${project.brand_name}
Website: ${project.website_url ?? "not provided"}

Visibility gap prompt: "${promptText}"
Root cause: ${rootCause ?? "Not specified"}

Action to brief:
Title: ${actionTitle}
Description: ${actionDescription ?? "Not specified"}

Please create a detailed content brief for this action.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No brief response");
    }

    // Successfully generated brief - increment credits atomically
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("organisations")
      .update({
        brief_credits_used: credits.used + 1,
      })
      .eq("id", project.org_id);

    if (updateError) {
      console.error("Failed to update brief credits:", updateError);
      // Still return the brief, but log the credit update failure
    }

    // Get updated credits for response
    const updatedCredits = await getOrgBriefCredits(project.org_id);

    return NextResponse.json({
      brief: textBlock.text,
      credits: updatedCredits,
    });
  } catch (error) {
    console.error("Brief generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate brief" },
      { status: 500 }
    );
  }
}
