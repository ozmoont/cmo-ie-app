/**
 * /projects/[id]/gaps — redirect to the domains tab. Keeps the
 * sidebar link "just works" without exposing two URLs for the same
 * default content.
 */

import { redirect } from "next/navigation";

export default async function GapsIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/gaps/domains`);
}
