import { Suspense } from "react";

export const instant = false;

export default function PrintLayout({ children }: LayoutProps<"/">) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
