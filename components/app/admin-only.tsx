"use client";

import type { ReactNode } from "react";
import { useApp } from "./context";
import { ForbiddenView } from "./system-pages";

/** Renders the 403 page for non-admins (the API also returns 403). */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { me } = useApp();
  if (me.role !== "admin") return <ForbiddenView />;
  return <>{children}</>;
}
