"use client";

import { Component, type ReactNode } from "react";

/** Global error boundary: friendly message + Reload instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[ui] crashed:", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-md rounded-[12px] border border-line bg-white p-8 text-center shadow-[var(--shadow-card)]" role="alert">
        <h2 className="text-lg font-bold text-ink">Something went wrong on this page</h2>
        <p className="mt-2 text-sm text-muted">The rest of the app is still working. Reloading usually fixes this.</p>
        <button onClick={() => window.location.reload()} className="mt-5 h-10 rounded-[8px] bg-teal px-5 text-sm font-semibold text-white hover:bg-teal-dark">
          Reload
        </button>
      </div>
    );
  }
}
