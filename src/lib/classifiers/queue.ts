/**
 * Post-run classifier queue.
 *
 * After a visibility run completes, this walks the freshly-inserted
 * citations for that run, figures out which domains and URLs haven't
 * been classified yet, and batch-classifies them.
 *
 * Policy:
 *   - Fire-and-forget from the run engine. The run's "complete" event
 *     returns as soon as results are persisted; classification happens
 *     in the background so it never slows down the user-facing flow.
 *   - Hard cap at DOMAIN_BUDGET + URL_BUDGET per run so a pathological
 *     run (hundreds of unique URLs) doesn't blow the Claude bill.
 *   - Bounded concurrency — classifications are I/O bound so we can
 *     fan out modestly, but we avoid hammering Haiku rate limits.
 *   - Every classification is independent: a failure on one URL never
 *     takes down the rest of the batch.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { classifyDomain } from "./domain";
import { classifyUrl } from "./url";
import { canonicaliseDomain } from "./types";

/** Per-run maxima. Tighten if Claude cost becomes visible. */
const DOMAIN_BUDGET = 60;
const URL_BUDGET = 150;
/** How many classifications run concurrently. Haiku handles this easily. */
const CONCURRENCY = 5;

/**
 * Run a set of async tasks with a bounded concurrency pool. Each task
 * is independent; errors in one don't block the others.
 */
async function pool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  let index = 0;
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(
      (async () => {
        while (true) {
          const myIndex = index++;
          if (myIndex >= items.length) return;
          try {
            await worker(items[myIndex]);
          } catch (err) {
            console.error("classifier queue worker failed:", err);
          }
        }
      })()
    );
  }
  await Promise.all(workers);
}

export interface RunClassifierOpts {
  /**
   * Forces these domains to `your_own` regardless of content. Typically
   * populated from `project.brand_domains` by the caller.
   */
  yourOwnDomains?: string[];
  /**
   * Optional Anthropic API key override. Used to keep BYOK semantics
   * consistent with the rest of the pipeline.
   */
  apiKey?: string;
}

/**
 * For every new (uncached) domain and URL in this run, classify it.
 * Safe to invoke after every run; cache hits make repeat runs cheap.
 */
export async function classifyRunArtifacts(
  runId: string,
  opts: RunClassifierOpts = {}
): Promise<{
  domainsClassified: number;
  urlsClassified: number;
  domainsSkipped: number;
  urlsSkipped: number;
}> {
  const admin = createAdminClient();

  // Pull every citation from this run. Small queries even on big runs
  // (at most ~1000 rows for a 50-prompt × 4-model sweep).
  const { data: citations, error } = await admin
    .from("citations")
    .select("url, domain, results!inner(run_id)")
    .eq("results.run_id", runId);
  if (error || !citations) {
    console.error("classifyRunArtifacts: could not load citations:", error);
    return {
      domainsClassified: 0,
      urlsClassified: 0,
      domainsSkipped: 0,
      urlsSkipped: 0,
    };
  }

  const allDomains = new Set<string>();
  const allUrls = new Set<string>();
  for (const c of citations) {
    const d = canonicaliseDomain(c.domain ?? "");
    if (d) allDomains.add(d);
    if (c.url) allUrls.add(c.url);
  }

  // Fetch existing cache entries in one shot so we only send uncached
  // items to the classifier. Less work, lower Claude spend.
  const [classifiedDomains, classifiedUrls] = await Promise.all([
    allDomains.size > 0
      ? admin
          .from("domain_classifications")
          .select("domain")
          .in("domain", Array.from(allDomains))
      : Promise.resolve({ data: [] as { domain: string }[] }),
    allUrls.size > 0
      ? admin
          .from("url_classifications")
          .select("url")
          .in("url", Array.from(allUrls))
      : Promise.resolve({ data: [] as { url: string }[] }),
  ]);

  const knownDomains = new Set<string>(
    (classifiedDomains.data ?? []).map((r) => r.domain)
  );
  const knownUrls = new Set<string>(
    (classifiedUrls.data ?? []).map((r) => r.url)
  );

  const newDomains = Array.from(allDomains).filter((d) => !knownDomains.has(d));
  const newUrls = Array.from(allUrls).filter((u) => !knownUrls.has(u));

  // Apply budget — most-frequent first would be better but for MVP
  // we simply cap. Future: sort by citation count descending so the
  // domains appearing in many prompts get classified first.
  const domainsToClassify = newDomains.slice(0, DOMAIN_BUDGET);
  const urlsToClassify = newUrls.slice(0, URL_BUDGET);

  // Fire both batches in parallel — domains and URLs don't contend.
  await Promise.all([
    pool(
      domainsToClassify,
      async (d) => {
        await classifyDomain(d, {
          yourOwnDomains: opts.yourOwnDomains,
          apiKey: opts.apiKey,
        });
      },
      CONCURRENCY
    ),
    pool(
      urlsToClassify,
      async (u) => {
        await classifyUrl(u, { apiKey: opts.apiKey });
      },
      CONCURRENCY
    ),
  ]);

  return {
    domainsClassified: domainsToClassify.length,
    urlsClassified: urlsToClassify.length,
    domainsSkipped: Math.max(0, newDomains.length - DOMAIN_BUDGET),
    urlsSkipped: Math.max(0, newUrls.length - URL_BUDGET),
  };
}
