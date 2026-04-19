/**
 * Smoke test for the model adapter layer.
 *
 * Runs a single canned Irish-market prompt through every configured
 * adapter and prints the response length + source count. Skips any
 * model without credentials in the environment.
 *
 * Usage:
 *   # Make sure .env.local has ANTHROPIC_API_KEY, OPENAI_API_KEY,
 *   # GEMINI_API_KEY (or GOOGLE_API_KEY), PERPLEXITY_API_KEY set for
 *   # the adapters you want to exercise.
 *   npx tsx --env-file=.env.local scripts/smoke-models.ts
 *
 * Exits 0 on success, 1 if any available adapter errored.
 */

import {
  getAdapter,
  resolveAdapters,
  AdapterError,
  type ModelAdapter,
} from "../src/lib/models";
import type { AIModel } from "../src/lib/types";

const PROMPT =
  "What are the best interior design studios in Dublin for high-end residential projects?";

const MODELS: AIModel[] = ["claude", "chatgpt", "perplexity", "gemini"];

async function runOne(adapter: ModelAdapter): Promise<boolean> {
  const start = Date.now();
  try {
    const res = await adapter.query(PROMPT, { country: "IE" });
    const elapsed = Date.now() - start;
    const inlineCount = res.sources.filter((s) => s.cited_inline).length;
    console.log(
      `[${adapter.label}] OK in ${elapsed}ms — ` +
        `${res.text.length} chars, ${res.sources.length} sources ` +
        `(${inlineCount} cited inline), model=${res.model_version}`
    );
    if (res.sources.length > 0) {
      const first = res.sources[0];
      console.log(
        `  ├─ first source: ${first.domain}${first.cited_inline ? " (inline)" : ""}`
      );
    }
    console.log(
      `  └─ snippet: ${res.text.slice(0, 160).replace(/\s+/g, " ")}...`
    );
    return true;
  } catch (err) {
    const elapsed = Date.now() - start;
    if (err instanceof AdapterError) {
      console.error(`[${adapter.label}] FAIL in ${elapsed}ms — ${err.message}`);
    } else {
      console.error(
        `[${adapter.label}] FAIL in ${elapsed}ms —`,
        err instanceof Error ? err.message : err
      );
    }
    return false;
  }
}

async function main() {
  console.log(`Smoke-testing model adapters\nPrompt: "${PROMPT}"\n`);

  const { available, missing, unimplemented } = resolveAdapters(MODELS);

  if (missing.length) {
    console.log(
      `Skipping (no API key): ${missing.map((m) => getAdapter(m)?.label ?? m).join(", ")}`
    );
  }
  if (unimplemented.length) {
    console.log(`Skipping (not implemented): ${unimplemented.join(", ")}`);
  }
  if (available.length === 0) {
    console.error(
      "\nNo adapters available. Set at least one API key in your env and try again."
    );
    process.exit(1);
  }

  console.log(
    `Running ${available.length} adapter${available.length === 1 ? "" : "s"}: ${available.map((a) => a.label).join(", ")}\n`
  );

  // Sequential, not parallel — helps debug rate-limit edge cases and
  // keeps the output readable.
  let allOk = true;
  for (const adapter of available) {
    const ok = await runOne(adapter);
    if (!ok) allOk = false;
    console.log();
  }

  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Unexpected smoke-test failure:", err);
  process.exit(1);
});
