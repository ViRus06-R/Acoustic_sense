import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";

// Authenticated, client-rendered dashboard: every page loads user-scoped data in the browser after
// the session check, so navigations are allowed to block here (opt out of instant validation).
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={null}>
      <AppShell>
        <Suspense fallback={null}>{children}</Suspense>
      </AppShell>
    </Suspense>
  );
}
