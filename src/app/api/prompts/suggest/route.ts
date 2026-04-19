import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

/**
 * Fetches a website and extracts enough text to let Claude infer the
 * industry. Claude can't browse, so without this the model is forced to
 * guess what a brand does from its name alone - which is why prompts
 * came back generic/off-industry for anything that isn't a household
 * name.
 *
 * Returns `null` if the fetch fails, times out, or yields nothing
 * useful. The caller degrades gracefully in that case.
 */
async function fetchSiteContext(
  url: string
): Promise<string | null> {
  try {
    // Normalise - allow users to type "acme.ie" without scheme.
    const normalised = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    const res = await fetch(normalised, {
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CMO.ie-PromptBot/1.0; +https://cmo.ie)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;

    // Cap at ~200KB - landing pages that need more than that are an
    // outlier and we don't want to pull down a 10MB SPA shell.
    const reader = res.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let total = 0;
    const MAX = 200_000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= MAX) {
          await reader.cancel();
          break;
        }
      }
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(
      Buffer.concat(chunks.map((c) => Buffer.from(c)))
    );

    // Targeted signals first - these are where brands actually say
    // what they do.
    const pick = (re: RegExp) => {
      const m = html.match(re);
      return m?.[1]?.trim() ?? "";
    };

    const title = pick(/<title[^>]*>([^<]{1,300})<\/title>/i);
    const metaDesc = pick(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})["']/i
    );
    const ogDesc = pick(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})["']/i
    );
    const ogSite = pick(
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{1,200})["']/i
    );
    const h1 = pick(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i).replace(
      /<[^>]+>/g,
      " "
    );

    // Fallback: strip out head/scripts/styles and take first readable
    // chunk of body text. Keeps things lean - we just need enough for
    // industry inference, not a full dump.
    let bodySample = "";
    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
    if (bodyMatch) {
      bodySample = bodyMatch[0]
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200);
    }

    const parts = [
      title && `Title: ${title}`,
      ogSite && `Site name: ${ogSite}`,
      metaDesc && `Meta description: ${metaDesc}`,
      ogDesc && ogDesc !== metaDesc && `OG description: ${ogDesc}`,
      h1 && `H1: ${h1}`,
      bodySample && `Body excerpt: ${bodySample}`,
    ].filter(Boolean);

    if (parts.length === 0) return null;

    // Final guard - trim to ~3k chars, well inside what Sonnet can
    // digest without bloating the call.
    return parts.join("\n").slice(0, 3000);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    let { brandName, websiteUrl, projectId } = await request.json();

    // If projectId is provided but brand/website aren't, fetch from project
    if (projectId && (!brandName || !websiteUrl)) {
      const supabase = await createClient();
      const { data: project } = await supabase
        .from("projects")
        .select("brand_name, website_url")
        .eq("id", projectId)
        .single();

      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      brandName = project.brand_name;
      websiteUrl = project.website_url;
    }

    if (!brandName) {
      return NextResponse.json(
        { error: "brandName is required or projectId must be provided" },
        { status: 400 }
      );
    }

    // If Anthropic key isn't set, return helpful fallback
    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-...")
    ) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 503 }
      );
    }

    // Pull real site context so Claude can infer industry. This is the
    // piece that was missing - without it the model has to guess what
    // the brand does from its name, which produces off-industry prompts
    // for anything that isn't a household name.
    const siteContext = websiteUrl
      ? await fetchSiteContext(websiteUrl)
      : null;

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: `You are a GEO (Generative Engine Optimisation) expert helping Irish brands understand how AI search engines represent them.

Your job: given a brand and its website content, generate 10 conversational prompts that a real potential customer would type into ChatGPT, Perplexity, or Gemini when researching this exact type of company.

Method:
1. First, infer the brand's industry, sub-category, and customer from the website content provided. Be specific - not "a legal firm" but "a Dublin-based employment law firm serving SMEs".
2. Every prompt must be plausibly something that brand's actual customer would ask. No generic SaaS prompts unless the brand is SaaS. No B2C prompts if the brand is clearly B2B. Stay inside the inferred industry.
3. Prompts should be conversational, full questions - not keyword strings.
4. Mix the funnel: ~3 awareness (broad category/problem), ~4 consideration (comparing options, features, trust signals), ~3 decision (pricing, shortlists, specific providers).
5. Favour Ireland-specific phrasing where it would be natural ("in Dublin", "Irish", "Ireland", ".ie"), but don't force it into every prompt.
6. Some prompts should name competitors or category leaders the user might realistically compare against - this is how real users search.

Return ONLY valid JSON. No markdown fences, no preamble, no explanation:
[{"text": string, "category": "awareness"|"consideration"|"decision"}]`,
      messages: [
        {
          role: "user",
          content: [
            `Brand: ${brandName}`,
            websiteUrl ? `Website: ${websiteUrl}` : null,
            siteContext
              ? `\nWebsite content (use this to determine industry and customer - do not ignore it):\n${siteContext}`
              : `\n(No website content available - infer industry from the brand name alone, and flag uncertainty by staying broad.)`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text response from Claude" },
        { status: 500 }
      );
    }

    // Defensive JSON parsing - the system prompt says "no fences", but
    // if the model ever slips one in we don't want the whole call to
    // fail.
    let raw = textBlock.text.trim();
    if (raw.startsWith("```")) {
      raw = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
    }

    const suggestions = JSON.parse(raw);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Prompt suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
