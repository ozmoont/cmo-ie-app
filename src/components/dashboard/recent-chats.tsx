"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODEL_LABELS } from "@/lib/types";
import type { AIModel, Sentiment } from "@/lib/types";
import { Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";

interface Chat {
  prompt: string;
  model: AIModel;
  brandMentioned: boolean;
  position: number | null;
  sentiment: Sentiment | null;
  snippet: string;
}

interface RecentChatsProps {
  chats: Chat[];
  brandName: string;
}

export function RecentChats({ chats, brandName }: RecentChatsProps) {
  const [showAll, setShowAll] = useState(false);
  const [mentionsOnly, setMentionsOnly] = useState(false);

  const filtered = mentionsOnly
    ? chats.filter((c) => c.brandMentioned)
    : chats;
  const visible = showAll ? filtered : filtered.slice(0, 6);

  return (
    <div>
      {/* Filter toggle */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setMentionsOnly(false)}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            !mentionsOnly
              ? "bg-emerald/15 text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          All responses ({chats.length})
        </button>
        <button
          onClick={() => setMentionsOnly(true)}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            mentionsOnly
              ? "bg-emerald/15 text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Brand mentions only (
          {chats.filter((c) => c.brandMentioned).length})
        </button>
      </div>

      {/* Chat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((chat, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="pt-4 pb-4">
              {/* Header: model + status */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-secondary">
                  {MODEL_LABELS[chat.model] ?? chat.model}
                </span>
                <div className="flex items-center gap-2">
                  {chat.brandMentioned ? (
                    <span className="flex items-center gap-1 text-xs text-text-secondary">
                      <Eye className="h-3 w-3" />
                      {chat.position ? `#${chat.position}` : "Mentioned"}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-text-secondary">
                      <EyeOff className="h-3 w-3" />
                      Not mentioned
                    </span>
                  )}
                  {chat.sentiment && (
                    <Badge
                      variant={chat.sentiment}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {chat.sentiment}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Prompt */}
              <p className="text-xs font-medium mb-2 line-clamp-2 text-text-primary">
                &ldquo;{chat.prompt}&rdquo;
              </p>

              {/* Snippet */}
              <p className="text-xs text-text-secondary leading-relaxed line-clamp-4">
                {highlightBrand(chat.snippet, brandName)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Show more/less */}
      {filtered.length > 6 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mt-4 mx-auto transition-colors"
        >
          {showAll ? (
            <>
              Show less <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Show all {filtered.length} responses{" "}
              <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

/** Visually highlight brand name in snippet text */
function highlightBrand(text: string, brand: string): React.ReactNode {
  if (!brand) return text;
  const regex = new RegExp(`(${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <span key={i} className="text-text-primary font-medium">
        {part}
      </span>
    ) : (
      part
    )
  );
}
