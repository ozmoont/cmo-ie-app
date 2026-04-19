"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Download, ArrowLeft, Check } from "lucide-react";
import { DRAFT_OUTPUT_LABELS } from "@/lib/types";
import type { DraftOutputType } from "@/lib/types";

interface DraftViewerProps {
  draft: string;
  outputType: DraftOutputType;
  onBack: () => void;
}

export function DraftViewer({
  draft,
  outputType,
  onBack,
}: DraftViewerProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([draft], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${outputType.replace("_", "-")}-draft.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-border">
        <Badge>{DRAFT_OUTPUT_LABELS[outputType]}</Badge>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copyState === "copied" ? (
              <>
                <Check className="h-4 w-4 mr-1 text-emerald-dark" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>
      </div>

      <div className="prose prose-sm max-w-none [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-text-primary [&_h1]:mb-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mb-1 [&_p]:text-sm [&_p]:text-text-secondary [&_p]:leading-relaxed [&_p]:mb-3 [&_li]:text-sm [&_li]:text-text-secondary [&_strong]:text-text-primary [&_code]:bg-surface-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-text-primary [&_code]:font-mono [&_code]:text-[0.85em] [&_pre]:bg-surface-muted [&_pre]:p-4 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-border">
        {draft.split("\n").map((line, i) => {
          if (line.startsWith("# "))
            return <h1 key={i}>{line.slice(2)}</h1>;
          if (line.startsWith("## "))
            return <h2 key={i}>{line.slice(3)}</h2>;
          if (line.startsWith("### "))
            return <h3 key={i}>{line.slice(4)}</h3>;
          if (line.startsWith("- "))
            return (
              <p key={i} className="pl-4 text-sm text-text-secondary">
                &bull; {line.slice(2)}
              </p>
            );
          if (line.startsWith("**"))
            return (
              <p key={i}>
                <strong>{line.replace(/\*\*/g, "")}</strong>
              </p>
            );
          if (line.trim() === "") return <br key={i} />;
          return <p key={i}>{line}</p>;
        })}
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to brief
        </Button>
      </div>
    </div>
  );
}
