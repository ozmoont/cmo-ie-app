import { redirect } from "next/navigation";
import { getCurrentUser, getProfile } from "@/lib/queries";
import { DashboardShell } from "@/components/dashboard/shell";
import { NewProjectForm } from "./form";

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);
  const orgData = profile?.organisations;
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as
    | { name: string; plan: string }
    | null
    | undefined;

  return (
    <DashboardShell
      orgName={org?.name ?? "CMO.ie"}
      plan={org?.plan ?? "trial"}
      userEmail={user.email}
    >
      <NewProjectForm />
    </DashboardShell>
  );
}
