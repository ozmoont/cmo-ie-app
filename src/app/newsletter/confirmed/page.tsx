/**
 * /newsletter/confirmed — terminal page after clicking the email
 * confirmation link. Also reached with `?status=invalid` when the
 * token was missing / tampered with / expired.
 */

import Link from "next/link";
import { Check, AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Newsletter confirmation — CMO.ie",
};

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const ok = status === "ok";

  return (
    <div className="min-h-screen bg-surface text-text-primary flex flex-col">
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight hover:text-emerald-dark transition-colors"
        >
          CMO.ie
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-lg text-center">
          {ok ? (
            <>
              <Check className="h-8 w-8 text-emerald-dark mx-auto mb-4" />
              <h1 className="text-2xl font-semibold tracking-tight">
                You&apos;re subscribed.
              </h1>
              <p className="mt-3 text-sm text-text-secondary leading-relaxed">
                We&apos;ll email the weekly Irish AI crawlability digest
                every Monday morning. You can unsubscribe any time via
                the link in every email.
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="h-8 w-8 text-warning mx-auto mb-4" />
              <h1 className="text-2xl font-semibold tracking-tight">
                That link didn&apos;t work.
              </h1>
              <p className="mt-3 text-sm text-text-secondary leading-relaxed">
                The confirmation link was invalid or has expired. Head
                back to{" "}
                <Link href="/crawlability" className="underline">
                  the crawlability tool
                </Link>{" "}
                and re-enter your email to get a fresh link.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
