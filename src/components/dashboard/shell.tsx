"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  FolderOpen,
  MessageSquare,
  Users,
  Settings,
  LogOut,
  Zap,
  Search,
  Globe,
  Target,
  Download,
} from "lucide-react";

interface DashboardShellProps {
  children: React.ReactNode;
  orgName?: string;
  plan?: string;
  userEmail?: string;
  projectId?: string;
  projectName?: string;
}

const mainNav = [
  { label: "Projects", href: "/dashboard", icon: FolderOpen },
];

function projectNav(id: string) {
  return [
    { label: "Overview", href: `/projects/${id}`, icon: BarChart3 },
    { label: "Insights", href: `/projects/${id}/insights`, icon: Search },
    { label: "Sources", href: `/projects/${id}/sources`, icon: Globe },
    { label: "Gaps", href: `/projects/${id}/gaps`, icon: Target },
    { label: "Prompts", href: `/projects/${id}/prompts`, icon: MessageSquare },
    { label: "Competitors", href: `/projects/${id}/competitors`, icon: Users },
    { label: "Actions", href: `/projects/${id}/actions`, icon: Zap },
  ];
}

export function DashboardShell({
  children,
  orgName = "CMO.ie",
  plan = "trial",
  userEmail,
  projectId,
  projectName,
}: DashboardShellProps) {
  const pathname = usePathname();
  const navItems = projectId ? projectNav(projectId) : mainNav;

  // Defer email rendering to avoid Cloudflare email obfuscation
  // breaking React hydration (CF rewrites email strings in HTML,
  // causing a server/client mismatch that silently kills hydration).
  // The setState here is the entire point of the effect — the rule's
  // cascading-render warning doesn't apply to a one-shot mount flag.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar — hidden in print. */}
      <header className="no-print border-b border-border bg-surface sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-6">
            <Link href="/dashboard">
              <span className="md:hidden text-base font-bold tracking-tight text-text-primary">CMO.ie</span>
              <span className="hidden md:inline text-base font-bold tracking-tight text-text-primary">Chief Marketing Officer</span>
            </Link>

            {projectName && (
              <>
                <span className="text-border">/</span>
                <span className="text-sm text-text-primary font-medium">
                  {projectName}
                </span>
              </>
            )}

            <span className="hidden md:inline text-sm text-text-secondary">
              {orgName}
              <span className="ml-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                {plan}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            {mounted && userEmail && (
              <span className="hidden md:inline text-sm text-text-secondary">{userEmail}</span>
            )}
            {plan === "agency" && (
              <Link
                href="/agency/dashboard"
                className="hidden md:inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] font-semibold text-emerald-dark hover:text-emerald-dark/80 transition-colors"
              >
                Agency
              </Link>
            )}
            {projectId && <ShellPrintButton />}
            <Link href="/settings">
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <form action="/api/auth/logout" method="POST">
              <Button variant="ghost" size="icon" type="submit">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Sub-navigation for project pages - with sliding indicator */}
      {projectId && (
        <SubNav projectId={projectId} pathname={pathname} navItems={navItems} />
      )}

      {/* Main content */}
      <main className="flex-1 bg-background">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}

/**
 * Project sub-navigation with a single sliding bar that tracks the active
 * tab. Measures each link's offsetLeft/offsetWidth on route change and
 * animates a translateX+width transform so the indicator "magnets" to
 * the new tab rather than jumping. Falls back to a static underline
 * before hydration so SSR output has the right visual state.
 */
function SubNav({
  projectId,
  pathname,
  navItems,
}: {
  projectId: string;
  pathname: string;
  navItems: ReturnType<typeof projectNav>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  const activeIndex = navItems.findIndex((item) => {
    return (
      pathname === item.href ||
      (item.href !== `/projects/${projectId}` && pathname.startsWith(item.href))
    );
  });

  // Measure once on mount + on any pathname change. Use layout effect so
  // the bar renders in-place for the first visible frame.
  useLayoutEffect(() => {
    const el = linkRefs.current[activeIndex];
    if (el) {
      setBar({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeIndex, pathname]);

  // Remeasure on viewport resize too - padding classes can shift left/width.
  useEffect(() => {
    const handle = () => {
      const el = linkRefs.current[activeIndex];
      if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
    };
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [activeIndex]);

  return (
    <nav className="no-print border-b border-border bg-surface overflow-x-auto scroll-smooth">
      <div
        ref={containerRef}
        className="mx-auto flex max-w-7xl gap-1 px-4 md:px-6 flex-nowrap relative"
      >
        {navItems.map((item, i) => {
          const isActive = i === activeIndex;
          return (
            <Link
              key={item.href}
              href={item.href}
              ref={(el) => {
                linkRefs.current[i] = el;
              }}
              className={cn(
                "relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                isActive
                  ? "text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {/* Sliding indicator - 2px bar at the bottom of the container.
            Animates transform + width together for the magnet effect. */}
        {bar && (
          <span
            aria-hidden="true"
            className="absolute bottom-0 h-[2px] bg-text-primary transition-[transform,width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{
              width: `${bar.width}px`,
              transform: `translateX(${bar.left}px)`,
            }}
          />
        )}
      </div>
    </nav>
  );
}

/**
 * Top-bar "Download PDF" button.
 *
 * Behaviour: calls `window.print()` on the current page. The browser's
 * native print dialog takes over; the user chooses "Save as PDF" and
 * gets whatever page they were looking at (Actions / Gaps / Sources /
 * etc.) rather than forcing them through the dedicated Overview
 * report. The print stylesheet in globals.css + `.no-print` classes
 * on the shell's header and SubNav produce a clean, single-column
 * output.
 *
 * If the user wants the polished one-pager summary instead, the
 * `/projects/[id]/report` URL is still reachable from the Overview
 * page and prints with the same CSS.
 */
function ShellPrintButton() {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => window.print()}
      aria-label="Download this page as PDF"
      title="Download PDF"
    >
      <Download className="h-4 w-4" />
    </Button>
  );
}
