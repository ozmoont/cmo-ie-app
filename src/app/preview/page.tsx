/**
 * /preview — historical alias for the full landing page.
 *
 * The teaser-vs-real-landing split lived here for ~2 weeks pre-launch:
 * the homepage at / ran the email-capture teaser while the full
 * landing was robots-noindexed at /preview so testers could see it.
 *
 * On 29 April 2026 we collapsed the teaser into /, and /preview is
 * no longer needed. We keep this route as a 308 (permanent) redirect
 * rather than 404'ing so any existing links (LinkedIn posts, internal
 * docs, old marketing emails) still resolve. The redirect is
 * permanent — search engines that indexed /preview during the
 * noindex window will eventually drop it from the index in favour
 * of /.
 *
 * If we ever need a separate "preview" surface again, this stub
 * should be replaced rather than deleted — the redirect is the
 * graceful path for stale inbound links.
 */

import { permanentRedirect } from "next/navigation";

export const metadata = {
  // Defensive — the redirect fires before render, but a client /
  // crawler that ignores the redirect status shouldn't index this
  // stub either.
  robots: { index: false, follow: false },
};

export default function PreviewRedirect() {
  permanentRedirect("/");
}
