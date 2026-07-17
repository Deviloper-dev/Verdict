"use client";

import { useEffect } from "react";

/**
 * Strips consumed one-shot query params (?error=, ?added=) from the address
 * bar after the server render has displayed them, so refreshes and shared
 * URLs don't resurrect stale messages. Renders nothing.
 */
export default function ClearQueryParams({ params }: { params: string[] }) {
  useEffect(() => {
    const url = new URL(location.href);
    let changed = false;
    for (const p of params) {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    }
    if (changed) history.replaceState(null, "", url);
  }, [params]);
  return null;
}
