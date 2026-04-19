"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Loader2,
  Check,
  AlertTriangle,
  X,
  Eye,
  EyeOff,
  Globe,
  MessageSquare,
} from "lucide-react";
import { LoadingPhrases } from "@/components/ui/loading-phrases";

interface ProgressEvent {
  type: string;
  message: string;
  current?: number;
  total?: number;
  detail?: {
    prompt?: string;
    model?: string;
    brand_mentioned?: boolean;
    sentiment?: string;
    citationCount?: number;
  };
}

interface RunTriggerProps {
  projectId: string;
}

export function RunTrigger({ projectId }: RunTriggerProps) {
  const [state, setState] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const triggerRun = async () => {
    setState("running");
    setEvents([]);
    setCurrent(0);
    setTotal(0);
    setShowLog(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/projects/${projectId}/runs`, {
        method: "POST",
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Run failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response stream");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: ProgressEvent = JSON.parse(line.slice(6));
              setEvents((prev) => [...prev, event]);

              if (event.current !== undefined) setCurrent(event.current);
              if (event.total !== undefined) setTotal(event.total);

              if (event.type === "complete") {
                setState("success");
                setTimeout(() => window.location.reload(), 3000);
              } else if (event.type === "error") {
                setState("error");
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      }

      // If we finished reading but didn't get a complete event, mark success
      if (state === "running") {
        setState("success");
        setTimeout(() => window.location.reload(), 3000);
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setState("error");
        setEvents((prev) => [
          ...prev,
          {
            type: "error",
            message: err instanceof Error ? err.message : "Something went wrong",
          },
        ]);
      }
    }
  };

  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={triggerRun} disabled={state === "running"}>
          {state === "running" ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : state === "success" ? (
            <Check className="h-4 w-4 mr-1.5 text-emerald-light" />
          ) : state === "error" ? (
            <AlertTriangle className="h-4 w-4 mr-1.5" />
          ) : (
            <Play className="h-4 w-4 mr-1.5" />
          )}
          {state === "running"
            ? `Running · ${pct}%`
            : state === "success"
              ? "Complete - refreshing…"
              : state === "error"
                ? "Retry"
                : "Run now"}
        </Button>

        {events.length > 0 && (
          <button
            onClick={() => setShowLog(!showLog)}
            className="text-xs uppercase tracking-[0.15em] font-semibold text-text-muted hover:text-text-primary transition-colors"
          >
            {showLog ? "Hide log" : "Show log"}
          </button>
        )}
      </div>

      {/* Progress rail + loading phrase - editorial, no card */}
      {state === "running" && (
        <div className="space-y-3 max-w-sm">
          {total > 0 && (
            <div className="h-[2px] rounded-full bg-border overflow-hidden w-full">
              <div
                className="h-full rounded-full bg-emerald-dark transition-[width] duration-500 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          <LoadingPhrases
            type="analysing"
            className="!flex-row !gap-2 !items-center"
            interval={3200}
          />
        </div>
      )}

      {/* Event log - monospace stream, hairline-bordered, no card */}
      {showLog && events.length > 0 && (
        <div className="max-w-2xl border-y border-border py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-text-muted">
              Run log ·{" "}
              <span className="font-mono tabular-nums">
                {current}/{total}
              </span>
            </span>
            <button
              onClick={() => setShowLog(false)}
              className="text-text-muted hover:text-text-primary transition-colors"
              aria-label="Hide log"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1 text-xs font-mono">
            {events.map((e, i) => {
              const tone =
                e.type === "error"
                  ? "text-danger"
                  : e.type === "complete"
                    ? "text-emerald-dark"
                    : e.type === "model_done"
                      ? e.detail?.brand_mentioned
                        ? "text-text-primary"
                        : "text-text-muted"
                      : e.type === "model_error"
                        ? "text-warning"
                        : "text-text-secondary";
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 py-0.5 ${tone}`}
                >
                  <span className="shrink-0 mt-0.5">
                    {e.type === "start" || e.type === "prompt_start" ? (
                      <MessageSquare className="h-3 w-3" />
                    ) : e.type === "model_done" ? (
                      e.detail?.brand_mentioned ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <EyeOff className="h-3 w-3" />
                      )
                    ) : e.type === "saving" ? (
                      <Globe className="h-3 w-3" />
                    ) : e.type === "complete" ? (
                      <Check className="h-3 w-3" />
                    ) : e.type === "error" || e.type === "model_error" ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <span className="w-3" />
                    )}
                  </span>
                  <span>{e.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
