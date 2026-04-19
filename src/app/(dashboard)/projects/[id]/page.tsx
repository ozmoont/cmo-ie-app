import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getCurrentUser,
  getProfile,
  getProject,
  getPrompts,
  getCompetitors,
  getDailyRuns,
  getResultsForRuns,
  getCitationsForResults,
  computeVisibilityScore,
  computeVisibilityTrend,
  computeModelScores,
  computePromptBreakdown,
  computeCitationDomains,
  computeSentimentDistribution,
  computeMentionPositions,
  computeCompetitorAppearances,
} from "@/lib/queries";
import { MODEL_LABELS, PLAN_LIMITS } from "@/lib/types";
import {
  relativeTime,
  summariseScore,
  summarisePosition,
  summariseSentiment,
} from "@/lib/format";
import { DashboardShell } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { ProjectCharts } from "@/components/dashboard/project-charts";
import {
  CitationDomains,
  SentimentChart,
  MentionPositionChart,
  CompetitorAppearances,
} from "@/components/dashboard/analytics-charts";
import { RunTrigger } from "@/components/dashboard/run-trigger";
import { RecentChats } from "@/components/dashboard/recent-chats";
import { BlurGate } from "@/components/dashboard/blur-gate";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

// Per-project page title so browser tabs and share cards carry the brand name.
// Falls back to a generic title if the project can't be loaded.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return { title: "Project" };
  return {
    title: `${project.brand_name} - AI visibility`,
    description: `Track how AI search engines talk about ${project.brand_name}.`,
  };
}

export default async function ProjectDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, project, prompts, competitors, runs] = await Promise.all([
    getProfile(user.id),
    getProject(projectId),
    getPrompts(projectId),
    getCompetitors(projectId),
    getDailyRuns(projectId, 14),
  ]);

  if (!project) redirect("/dashboard");

  const orgData = profile?.organisations;
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as
    | { name: string; plan: string }
    | null
    | undefined;

  const userPlan = (org?.plan ?? "trial") as keyof typeof PLAN_LIMITS;
  const planLimits = PLAN_LIMITS[userPlan];
  const blurResults = planLimits.blurResults;

  const results = await getResultsForRuns(runs.map((r) => r.id));
  const citations = await getCitationsForResults(results.map((r) => r.id));

  // Latest run scores
  const latestResults = runs[0]
    ? results.filter((r) => r.run_id === runs[0].id)
    : [];
  const weekAgoResults = runs[7]
    ? results.filter((r) => r.run_id === runs[7].id)
    : [];

  const score = computeVisibilityScore(latestResults);
  const weekAgoScore = computeVisibilityScore(weekAgoResults);
  const delta = score - weekAgoScore;
  const trend = computeVisibilityTrend(runs, results);
  const modelScores = computeModelScores(latestResults, project.models);
  const promptBreakdown = computePromptBreakdown(prompts, latestResults);

  // Sentiment
  const sentimentDist = computeSentimentDistribution(latestResults);
  const totalMentions = sentimentDist.reduce((a, d) => a + d.count, 0);
  const sentimentScore =
    totalMentions > 0
      ? Math.round(
          sentimentDist.reduce(
            (acc, d) =>
              acc +
              d.count *
                (d.sentiment === "positive"
                  ? 100
                  : d.sentiment === "neutral"
                    ? 50
                    : 0),
            0
          ) / totalMentions
        )
      : null;

  // Average mention position
  const mentionPositions = computeMentionPositions(latestResults);
  const mentionedResults = latestResults.filter(
    (r) => r.brand_mentioned && r.mention_position !== null
  );
  const avgPosition =
    mentionedResults.length > 0
      ? (
          mentionedResults.reduce(
            (sum, r) => sum + (r.mention_position ?? 0),
            0
          ) / mentionedResults.length
        ).toFixed(1)
      : "-";

  // Citations
  const citationDomains = computeCitationDomains(citations);
  const competitorAppearances = computeCompetitorAppearances(
    citations,
    competitors
  );

  // Recent chats (latest run's results with snippets)
  const recentChats = latestResults
    .filter((r) => r.response_snippet && r.response_snippet.length > 10)
    .map((r) => {
      const prompt = prompts.find((p) => p.id === r.prompt_id);
      return {
        prompt: prompt?.text ?? "Unknown prompt",
        model: r.model,
        brandMentioned: r.brand_mentioned,
        position: r.mention_position,
        sentiment: r.sentiment,
        snippet: r.response_snippet!,
      };
    });

  // Derived copy
  const scoreSummary = summariseScore(score, project.brand_name);
  const positionSummary = summarisePosition(avgPosition, project.brand_name);
  const sentimentSummary = summariseSentiment(
    sentimentScore,
    totalMentions,
    project.brand_name
  );
  const lastScannedAt = runs[0]?.completed_at ?? runs[0]?.created_at ?? null;
  const modelsText = project.models.map((m) => MODEL_LABELS[m]).join(", ");

  return (
    <DashboardShell
      orgName={org?.name ?? "CMO.ie"}
      plan={org?.plan ?? "trial"}
      userEmail={user.email}
      projectId={projectId}
      projectName={project.name}
    >
      {/* ── Page header ── kicker + brand + meta + run trigger */}
      <header className="grid grid-cols-12 gap-6 items-end pb-10 md:pb-14 border-b border-border">
        <div className="col-span-12 md:col-span-8">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold">
            Project ·{" "}
            {runs.length === 0 ? "Awaiting first scan" : `Scanned ${relativeTime(lastScannedAt)}`}
          </p>
          <h1 className="mt-3 text-3xl md:text-5xl font-semibold text-text-primary tracking-tight leading-[1.05]">
            {project.brand_name}
          </h1>
          <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
            Tracking {prompts.length} prompt{prompts.length === 1 ? "" : "s"} across{" "}
            {modelsText || `${project.models.length} AI models`}.
          </p>
        </div>
        <div className="col-span-12 md:col-span-4 md:flex md:justify-end md:items-end">
          <RunTrigger projectId={projectId} />
        </div>
      </header>

      {/* ── First-run teach block ── editorial, no card, no icon-in-circle.
          Shown only when no runs have ever completed. */}
      {runs.length === 0 && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-12 md:py-20 border-b border-border">
          <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2">
            First scan
          </p>
          <div className="col-span-12 md:col-span-9 max-w-2xl space-y-6">
            <h2 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15]">
              You&apos;re set up. Run your first scan to see where you stand.
            </h2>
            <p className="text-base text-text-secondary leading-relaxed">
              Hitting <span className="text-text-primary font-medium">Run now</span> above
              queries {project.models.length} AI model
              {project.models.length === 1 ? "" : "s"} with your {prompts.length}{" "}
              prompt{prompts.length === 1 ? "" : "s"}. We check whether{" "}
              <span className="text-text-primary font-medium">
                {project.brand_name}
              </span>{" "}
              gets mentioned, track competitor appearances, and build your visibility
              picture. Takes 30-60 seconds.
            </p>

            {/* Three inline teach lines - no card grid, just editorial rows */}
            <dl className="pt-4 space-y-5 text-sm">
              <div className="grid grid-cols-[120px_1fr] md:grid-cols-[140px_1fr] gap-4">
                <dt className="uppercase text-xs tracking-[0.15em] text-text-muted font-semibold">
                  What we check
                </dt>
                <dd className="text-text-secondary leading-relaxed">
                  Whether AI models mention your brand when answering the
                  questions your customers actually ask.
                </dd>
              </div>
              <div className="grid grid-cols-[120px_1fr] md:grid-cols-[140px_1fr] gap-4">
                <dt className="uppercase text-xs tracking-[0.15em] text-text-muted font-semibold">
                  What you get
                </dt>
                <dd className="text-text-secondary leading-relaxed">
                  A visibility score, sentiment analysis, competitor tracking, and
                  the citation sources AI models pull from.
                </dd>
              </div>
              <div className="grid grid-cols-[120px_1fr] md:grid-cols-[140px_1fr] gap-4">
                <dt className="uppercase text-xs tracking-[0.15em] text-text-muted font-semibold">
                  What&apos;s next
                </dt>
                <dd className="text-text-secondary leading-relaxed">
                  Daily automated scans track movement over time so you can see
                  what&apos;s working.
                </dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      {/* ── Hero: Visibility score ── type-led, no card */}
      {runs.length > 0 && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-12 md:py-20 border-b border-border">
          <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-6 flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            AI visibility
          </p>
          <div className="col-span-12 md:col-span-9 space-y-6">
            <div className="flex items-baseline gap-4 flex-wrap">
              <div className="flex items-baseline gap-2">
                <span className="font-mono tabular-nums text-7xl md:text-8xl font-medium text-text-primary leading-none">
                  {score}
                </span>
                <span className="font-mono tabular-nums text-3xl md:text-4xl text-text-muted leading-none">
                  %
                </span>
              </div>
              {delta !== 0 && (
                <span
                  className={`font-mono tabular-nums text-xl md:text-2xl font-medium ${
                    delta > 0 ? "text-emerald-dark" : "text-danger"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta}
                  <span className="text-base text-text-muted ml-1">
                    vs 7d ago
                  </span>
                </span>
              )}
            </div>

            <div className="max-w-2xl">
              <p className="text-lg md:text-xl font-semibold text-text-primary">
                {scoreSummary.label}.
              </p>
              <p className="text-base md:text-lg text-text-secondary leading-relaxed mt-2">
                {scoreSummary.body}
              </p>
            </div>

            <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
              Based on {latestResults.length}{" "}
              {latestResults.length === 1 ? "check" : "checks"} · {prompts.length}{" "}
              prompt{prompts.length === 1 ? "" : "s"} × {project.models.length}{" "}
              model{project.models.length === 1 ? "" : "s"}
            </p>
          </div>
        </section>
      )}

      {/* ── Action Plan nudge ── appears when score is low.
          Editorial, no gradient, no icon circle. */}
      {runs.length > 0 && score < 30 && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-12 md:py-16 border-b border-border">
          <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2">
            Next steps
          </p>
          <div className="col-span-12 md:col-span-9 max-w-2xl space-y-5">
            <h2 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15]">
              {score === 0
                ? `You're invisible to AI. Here's how to fix that.`
                : `Your visibility needs work.`}
            </h2>
            <p className="text-base text-text-secondary leading-relaxed">
              {score === 0
                ? `AI models aren't mentioning ${project.brand_name} at all. The Action Plan tells you exactly what content to create so AI starts recommending you.`
                : `${project.brand_name} is only mentioned ${score}% of the time. The Action Plan identifies the gaps and gives you specific content briefs to improve.`}
            </p>
            <div className="pt-1">
              <Link href={`/projects/${projectId}/actions`}>
                <Button variant="default" size="lg">
                  Get the action plan
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Secondary metrics: Position + Sentiment ── type-led, two-col */}
      {runs.length > 0 && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-12 md:py-16 border-b border-border">
          <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold">
            How you appear
          </p>
          <div className="col-span-12 md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12">
            {/* Position */}
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
                Average position
              </p>
              <div className="flex items-baseline gap-2">
                {avgPosition === "-" ? (
                  <span className="font-mono tabular-nums text-5xl md:text-6xl font-medium text-text-muted leading-none">
                    -
                  </span>
                ) : (
                  <>
                    <span className="font-mono tabular-nums text-xl md:text-2xl text-text-muted leading-none">
                      #
                    </span>
                    <span className="font-mono tabular-nums text-5xl md:text-6xl font-medium text-text-primary leading-none">
                      {avgPosition}
                    </span>
                  </>
                )}
              </div>
              <p className="text-sm font-semibold text-text-primary pt-2">
                {positionSummary.label}.
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">
                {positionSummary.body}
              </p>
              <p className="text-xs text-text-muted leading-relaxed pt-1">
                {mentionedResults.length > 0
                  ? `Mentioned ${mentionedResults.length}× across ${project.models.length} model${project.models.length === 1 ? "" : "s"}.`
                  : "Not mentioned in any responses yet."}
              </p>
            </div>

            {/* Sentiment */}
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
                Brand sentiment
              </p>
              <div className="flex items-baseline gap-2">
                {sentimentScore === null ? (
                  <span className="font-mono tabular-nums text-5xl md:text-6xl font-medium text-text-muted leading-none">
                    -
                  </span>
                ) : (
                  <>
                    <span
                      className={`font-mono tabular-nums text-5xl md:text-6xl font-medium leading-none ${
                        sentimentScore >= 60
                          ? "text-emerald-dark"
                          : sentimentScore >= 40
                            ? "text-warning"
                            : "text-danger"
                      }`}
                    >
                      {sentimentScore}
                    </span>
                    <span className="font-mono tabular-nums text-xl md:text-2xl text-text-muted leading-none">
                      /100
                    </span>
                  </>
                )}
              </div>
              <p className="text-sm font-semibold text-text-primary pt-2">
                {sentimentSummary.label}.
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">
                {sentimentSummary.body}
              </p>
              <p className="text-xs text-text-muted leading-relaxed pt-1">
                {sentimentDist.find((d) => d.sentiment === "positive")?.count ?? 0}{" "}
                positive ·{" "}
                {sentimentDist.find((d) => d.sentiment === "neutral")?.count ?? 0}{" "}
                neutral ·{" "}
                {sentimentDist.find((d) => d.sentiment === "negative")?.count ?? 0}{" "}
                negative
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Visibility over time + model breakdown ──
          Chart components unchanged; chrome redesigned. */}
      {runs.length > 0 && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-12 md:py-16 border-b border-border">
          <div className="col-span-12 md:col-span-3 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold">
              Trend
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Whether {project.brand_name}&apos;s AI visibility is improving or
              declining, broken down by model so you can focus on the platforms
              where you&apos;re weakest.
            </p>
          </div>
          <div className="col-span-12 md:col-span-9">
            <BlurGate blurred={blurResults} feature="trend charts & model breakdown">
              <ProjectCharts
                trend={trend}
                modelScores={modelScores}
                promptBreakdown={promptBreakdown}
                brandName={project.brand_name}
              />
            </BlurGate>
          </div>
        </section>
      )}

      {/* ── Sources & Citations ── */}
      {runs.length > 0 && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-12 md:py-16 border-b border-border">
          <div className="col-span-12 md:col-span-3 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold">
              Sources
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              The websites AI models cite when answering your tracked prompts.
              To get mentioned, you need to appear here - so look at which
              domains are, and create content that fits the same shape.
            </p>
          </div>
          <div className="col-span-12 md:col-span-9">
            <BlurGate blurred={blurResults} feature="citation sources & competitor tracking">
              <div className="grid gap-10 md:gap-12 lg:grid-cols-2">
                <div>
                  <h3 className="text-base font-semibold text-text-primary mb-4">
                    Top cited domains
                  </h3>
                  <CitationDomains domains={citationDomains} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-text-primary mb-4">
                    Competitor visibility
                  </h3>
                  <CompetitorAppearances competitors={competitorAppearances} />
                  <p className="text-xs text-text-muted leading-relaxed mt-4 max-w-md">
                    If a competitor has more citations than {project.brand_name},
                    AI is recommending them. Check what content they have that
                    you don&apos;t - usually a clear FAQ, pricing, or comparison
                    page.
                  </p>
                </div>
              </div>
            </BlurGate>
          </div>
        </section>
      )}

      {/* ── Sentiment & Position detail ── */}
      {runs.length > 0 && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-12 md:py-16 border-b border-border">
          <div className="col-span-12 md:col-span-3 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold">
              Detail
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Sentiment distribution and where in a response you tend to appear.
              Being mentioned at #1 means AI recommends you first.
            </p>
          </div>
          <div className="col-span-12 md:col-span-9">
            <BlurGate blurred={blurResults} feature="sentiment & position breakdown">
              <div className="grid gap-10 md:gap-12 lg:grid-cols-2">
                <div>
                  <h3 className="text-base font-semibold text-text-primary mb-4">
                    Sentiment distribution
                  </h3>
                  <SentimentChart distribution={sentimentDist} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-text-primary mb-4">
                    Mention position
                  </h3>
                  <MentionPositionChart positions={mentionPositions} />
                </div>
              </div>
            </BlurGate>
          </div>
        </section>
      )}

      {/* ── Recent AI responses ── */}
      {runs.length > 0 && recentChats.length > 0 && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-12 md:py-16">
          <div className="col-span-12 md:col-span-3 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold">
              Responses
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              The actual replies AI gave. Look for responses where
              you&apos;re <em className="not-italic text-text-primary font-medium">
              not</em> mentioned - those are the biggest opportunities.
            </p>
          </div>
          <div className="col-span-12 md:col-span-9">
            <BlurGate blurred={blurResults} feature="full AI response transcripts">
              <RecentChats chats={recentChats} brandName={project.brand_name} />
            </BlurGate>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
