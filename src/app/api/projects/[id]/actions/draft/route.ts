import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/queries";
import type { DraftOutputType } from "@/lib/types";

const DRAFT_WRITER_SYSTEM: Record<DraftOutputType, string> = {
  blog_post: `You are a professional content strategist specialising in GEO (Generative Engine Optimisation) for the Irish market.

Generate a complete, publication-ready blog post based on the provided brief. The post should:
- Be 1500-2000 words
- Have a compelling introduction that hooks the reader
- Use clear, descriptive headings (H2 and H3 tags)
- Include natural, contextual references to the brand and Irish market
- Incorporate relevant schema.org markup recommendations (mention these inline)
- Use practical examples and data where possible
- End with a strong call-to-action
- Be optimised for AI search visibility (include natural language variations of target keywords)

Write in a professional but accessible tone. Format as clean markdown (no code fences).`,

  faq_page: `You are a content strategist specialising in FAQ pages and AI search visibility.

Generate 8-12 high-quality Q&A pairs based on the provided brief. Each Q&A should:
- Address real customer questions and pain points
- Be concise and directly answer the question
- Include relevant brand context where appropriate
- Reference Irish market considerations
- Be optimised for natural language AI search queries

Include a complete FAQPage schema.org JSON-LD markup at the end of your response (in a separate markdown code block for reference).

Format as clean markdown with numbered Q&A pairs, followed by the schema markup.`,

  schema_markup: `You are a technical SEO and structured data expert specialising in schema.org implementation.

Based on the provided brief, generate the most appropriate schema.org JSON-LD markup for the content. This may include:
- Organisation schema
- Article schema (for blog content)
- FAQPage schema (for FAQ content)
- HowTo schema (for instructional content)
- BreadcrumbList schema

For each schema type provided:
1. Show the complete JSON-LD markup
2. Explain what this schema does and why it matters for AI visibility
3. Provide implementation instructions (where to add it in the HTML)
4. Note any required fields and best practices

Format the markup in code blocks with clear explanations in between.`,
};

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

    const { brief, outputType } = await request.json();

    if (!brief || !outputType) {
      return NextResponse.json(
        { error: "brief and outputType are required" },
        { status: 400 }
      );
    }

    if (
      !["blog_post", "faq_page", "schema_markup"].includes(outputType)
    ) {
      return NextResponse.json(
        { error: "outputType must be 'blog_post', 'faq_page', or 'schema_markup'" },
        { status: 400 }
      );
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: DRAFT_WRITER_SYSTEM[outputType as DraftOutputType],
      messages: [
        {
          role: "user",
          content: `Brand: ${project.brand_name}
Website: ${project.website_url ?? "not provided"}

Content Brief:
${brief}

Please generate the ${outputType.replace("_", " ")} based on this brief.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No draft response");
    }

    return NextResponse.json({
      draft: textBlock.text,
      outputType,
    });
  } catch (error) {
    console.error("Draft generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    );
  }
}
