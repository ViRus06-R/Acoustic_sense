"use client";

import { NotFoundView } from "@/components/app/system-pages";

// Any unknown URL inside the app renders the 404 page within the app shell.
export default function MissingPage() {
  return <NotFoundView />;
}
