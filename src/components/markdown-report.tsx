/**
 * MarkdownReport — renders SEO audit (and any other) markdown bodies
 * with the CMO.ie design system. Uses react-markdown + remark-gfm so
 * tables, task lists, and strikethrough render correctly. Each
 * element is overridden so we can style with our own Tailwind tokens
 * (emerald-dark / text-primary / border) instead of dropping in the
 * Tailwind typography plugin, which collides with the CSS-based
 * Tailwind v4 config in this repo.
 *
 * The SEO audit specifically emits:
 *   - h1 / h2 / h3 / h4 for the report sections
 *   - markdown tables for Keyword Opportunities, On-Page Issues, etc.
 *   - bullet + numbered lists for action plans
 *   - inline code for selectors / URLs / meta tags
 *   - blockquotes for analyst commentary
 *   - links (internal anchors + external citations)
 *
 * If we ever swap the audit out for something with different
 * structure, this renderer should still cover it — it's just a
 * styled GFM renderer.
 */

"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentProps, JSX, ReactNode } from "react";

// react-markdown's component props don't perfectly match HTML element
// types (they wrap them with `node` etc.); we use `unknown` for the
// extra props we don't care about and pass-through the standard ones.
type ElementProps<E extends keyof JSX.IntrinsicElements> =
  ComponentProps<E> & { children?: ReactNode };

export function MarkdownReport({ children }: { children: string }) {
  return (
    <div className="text-sm text-text-secondary leading-relaxed space-y-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Headings ────────────────────────────────────────────
          // h1 is rare in audit bodies (we strip the report title at
          // the top in the parent). h2 = section, h3 = subsection,
          // h4 = sub-sub.
          h1: (props: ElementProps<"h1">) => (
            <h1
              {...props}
              className="text-2xl font-semibold text-text-primary tracking-tight mt-10 mb-4 pb-2 border-b border-border"
            />
          ),
          h2: (props: ElementProps<"h2">) => (
            <h2
              {...props}
              className="text-xl font-semibold text-text-primary tracking-tight mt-10 mb-3 pb-2 border-b border-border first:mt-0"
            />
          ),
          h3: (props: ElementProps<"h3">) => (
            <h3
              {...props}
              className="text-base font-semibold text-text-primary mt-7 mb-2"
            />
          ),
          h4: (props: ElementProps<"h4">) => (
            <h4
              {...props}
              className="text-sm font-semibold text-text-primary uppercase tracking-wider mt-5 mb-2"
            />
          ),

          // ── Paragraphs + inline ─────────────────────────────────
          p: (props: ElementProps<"p">) => (
            <p {...props} className="text-sm text-text-secondary leading-relaxed" />
          ),
          strong: (props: ElementProps<"strong">) => (
            <strong {...props} className="font-semibold text-text-primary" />
          ),
          em: (props: ElementProps<"em">) => (
            <em {...props} className="italic" />
          ),
          a: (props: ElementProps<"a">) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-dark underline underline-offset-4 hover:text-emerald-dark/80 break-words"
            />
          ),

          // ── Lists ───────────────────────────────────────────────
          ul: (props: ElementProps<"ul">) => (
            <ul
              {...props}
              className="list-disc pl-6 space-y-1.5 text-sm text-text-secondary marker:text-text-muted"
            />
          ),
          ol: (props: ElementProps<"ol">) => (
            <ol
              {...props}
              className="list-decimal pl-6 space-y-1.5 text-sm text-text-secondary marker:text-text-muted"
            />
          ),
          li: (props: ElementProps<"li">) => (
            <li {...props} className="leading-relaxed pl-1" />
          ),

          // ── Tables (GFM) ────────────────────────────────────────
          // The SEO audit leans heavily on tables. Wrap in an
          // overflow-x container so wide tables don't blow out the
          // page on narrow viewports.
          table: (props: ElementProps<"table">) => (
            <div className="overflow-x-auto my-5 -mx-1">
              <table
                {...props}
                className="w-full text-sm border-collapse border border-border rounded-md"
              />
            </div>
          ),
          thead: (props: ElementProps<"thead">) => (
            <thead {...props} className="bg-emerald-dark/5" />
          ),
          th: (props: ElementProps<"th">) => (
            <th
              {...props}
              className="text-left text-xs uppercase tracking-wider font-semibold text-emerald-dark px-3 py-2 border-b border-border"
            />
          ),
          td: (props: ElementProps<"td">) => (
            <td
              {...props}
              className="px-3 py-2 border-b border-border align-top text-text-secondary"
            />
          ),
          tr: (props: ElementProps<"tr">) => (
            <tr {...props} className="last:border-0" />
          ),

          // ── Code ────────────────────────────────────────────────
          // We don't language-highlight (audit bodies use ``` for
          // selectors / meta tags, not real source). Just style the
          // monospace + box.
          code: (props: ElementProps<"code"> & { inline?: boolean }) => {
            const { inline, className, ...rest } = props;
            if (inline) {
              return (
                <code
                  {...rest}
                  className="font-mono text-xs bg-surface-muted px-1.5 py-0.5 rounded text-text-primary border border-border"
                />
              );
            }
            return (
              <code
                {...rest}
                className={`font-mono text-xs ${className ?? ""}`}
              />
            );
          },
          pre: (props: ElementProps<"pre">) => (
            <pre
              {...props}
              className="bg-surface-muted border border-border rounded-md p-4 overflow-x-auto text-xs leading-relaxed my-4"
            />
          ),

          // ── Blockquotes ─────────────────────────────────────────
          blockquote: (props: ElementProps<"blockquote">) => (
            <blockquote
              {...props}
              className="border-l-2 border-emerald-dark/40 pl-4 py-1 my-4 text-text-secondary italic"
            />
          ),

          // ── Horizontal rule ─────────────────────────────────────
          hr: (props: ElementProps<"hr">) => (
            <hr {...props} className="my-8 border-border" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
