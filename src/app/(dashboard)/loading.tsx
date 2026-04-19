import { LoadingPhrases } from "@/components/ui/loading-phrases";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingPhrases type="analysing" />
    </div>
  );
}
