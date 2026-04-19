"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PHRASE_SETS = {
  analysing: [
    "Warming up the AI engines…",
    "Crunching your visibility data…",
    "Interrogating the models…",
    "Noodling on your brand mentions…",
    "Fizzlgizzling the search results…",
    "CMO'ing at full throttle…",
    "Comparing you to the competition…",
    "Reading between the citations…",
    "Snooping on what ChatGPT thinks…",
    "Asking Gemini some awkward questions…",
    "Poking around the AI responses…",
    "Making the robots do maths…",
    "Untangling the data spaghetti…",
    "Triangulating your brand position…",
    "Doing the competitive intelligence thing…",
    "Almost there, just double-checking…",
  ],
  generating: [
    "Assembling the strategy team…",
    "Brewing up some recommendations…",
    "The AI strategist is thinking…",
    "Gap Analyst has entered the chat…",
    "Prioritising actions by impact…",
    "Crafting something brilliant…",
    "Scribbling notes furiously…",
    "Running it past the Strategist…",
    "CMO'ing intensifies…",
    "Building your action plan…",
    "Sorting the quick wins from the big bets…",
    "Nearly done, just polishing…",
  ],
  suggesting: [
    "Studying your brand…",
    "Thinking like your customers…",
    "Imagining what people ask AI…",
    "Getting into the buyer mindset…",
    "Brainstorming prompt ideas…",
    "Channelling your target audience…",
    "Exploring the customer journey…",
    "Nearly there, picking the best ones…",
  ],
} as const;

type PhraseSet = keyof typeof PHRASE_SETS;

interface LoadingPhrasesProps {
  type?: PhraseSet;
  className?: string;
  interval?: number;
}

export function LoadingPhrases({
  type = "analysing",
  className,
  interval = 2800,
}: LoadingPhrasesProps) {
  const phrases = PHRASE_SETS[type];
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % phrases.length);
        setFading(false);
      }, 300);
    }, interval);

    return () => clearInterval(timer);
  }, [phrases.length, interval]);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* Single source of motion - the ping halo duplicated the spin and fought for attention. */}
      <Loader2 className="h-8 w-8 animate-spin text-emerald" />
      <p
        className={cn(
          // Blur on crossfade bridges the two phrase states so the eye reads a single morph, not a swap.
          "text-sm text-text-secondary min-h-[1.25rem] text-center transition-[opacity,filter] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
          fading ? "opacity-0 blur-[2px]" : "opacity-100 blur-0"
        )}
      >
        {phrases[index]}
      </p>
    </div>
  );
}
