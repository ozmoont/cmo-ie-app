import { redirect } from "next/navigation";

export default async function SourcesIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/sources/domains`);
}
