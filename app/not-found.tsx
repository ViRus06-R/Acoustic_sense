import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md rounded-[12px] border border-line bg-white p-10 text-center shadow-[var(--shadow-card)]">
        <div className="text-xs font-bold tracking-[0.14em] text-muted">ERROR 404</div>
        <h1 className="mt-1 text-xl font-bold text-ink">This page could not be found</h1>
        <p className="mt-2 text-sm text-muted">The link may be incorrect or the page was moved.</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-[8px] bg-teal px-5 text-sm font-semibold text-white hover:bg-teal-dark">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
