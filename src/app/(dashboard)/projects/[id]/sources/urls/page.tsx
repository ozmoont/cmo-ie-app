/**
 * URLs tab placeholder — workstream C will replace this with the real
 * drill-down (URL-level citation counts, page-type filter, per-URL
 * triggering-prompts drawer).
 *
 * Kept as a routable page so the Sources tab bar doesn't 404 when the
 * user clicks URLs before C ships.
 */

import Link from "next/link";
import { Construction } from "lucide-react";

export default async function SourcesUrlsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <section className="py-16 max-w-2xl">
      <div className="flex items-start gap-4">
        <Construction className="h-5 w-5 text-text-muted mt-0.5 shrink-0" />
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            URL-level drill-down — coming next.
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            The domain view is live above. URL-level details (page type,
            per-URL citation counts, which prompts triggered each URL, side
            drawer with response snippets) are the next ship on the Sources
            track. Follow along in{" "}
            <Link
              href={`/projects/${id}/sources/domains`}
              className="underline text-text-primary"
            >
              Domains
            </Link>{" "}
            for now — that&apos;s where the immediate action is.
          </p>
        </div>
      </div>
    </section>
  );
}
