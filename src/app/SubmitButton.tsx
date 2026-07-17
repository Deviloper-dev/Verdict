"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for server-action forms: disables and swaps its label while
 * the action is pending, so double-clicks can't fire the mutation twice.
 */
export default function SubmitButton({
  children,
  pendingLabel,
  className,
  style,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} style={style} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
