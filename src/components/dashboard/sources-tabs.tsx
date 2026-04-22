"use client";

/**
 * Client-side tab nav for the Sources section. Matches the visual
 * grammar of the main DashboardShell's SubNav (underline indicator,
 * active=primary, hover=primary) but scoped to Sources.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, FileText } from "lucide-react";

interface SourcesTabsProps {
  projectId: string;
}

export function SourcesTabs({ projectId }: SourcesTabsProps) {
  const pathname = usePathname();
  const base = `/projects/${projectId}/sources`;

  const tabs = [
    {
      label: "Domains",
      href: `${base}/domains`,
      icon: Globe,
      match: (p: string) =>
        p === `${base}` || p === base || p === `${base}/domains` || p.startsWith(`${base}/domains`),
    },
    {
      label: "URLs",
      href: `${base}/urls`,
      icon: FileText,
      match: (p: string) => p.startsWith(`${base}/urls`),
    },
  ];

  return (
    <nav className="flex gap-1 border-b border-border -mx-4 md:-mx-0 px-4 md:px-0 mt-6">
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] border-b-2 -mb-px ${
              active
                ? "text-text-primary border-text-primary"
                : "text-text-secondary hover:text-text-primary border-transparent"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
