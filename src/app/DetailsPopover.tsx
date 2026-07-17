"use client";

import { useEffect, useRef } from "react";

/**
 * A <details> popover (name/password editors in the topbar) that also closes
 * when the user clicks anywhere outside it.
 */
export default function DetailsPopover({
  summary,
  title,
  children,
}: {
  summary: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const el = ref.current;
      if (el?.open && e.target instanceof Node && !el.contains(e.target)) {
        el.open = false;
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <details className="name-editor" ref={ref}>
      <summary title={title}>{summary}</summary>
      {children}
    </details>
  );
}
