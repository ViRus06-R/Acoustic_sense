import { Suspense } from "react";
import { AuthSplit } from "@/components/app/auth-layout";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthSplit>
      <Suspense fallback={null}>{children}</Suspense>
    </AuthSplit>
  );
}
