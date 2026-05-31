import { useRef, type ReactNode } from 'react';

type Props = {
  active: boolean;
  children: ReactNode;
};

/** Keeps children mounted after first visit so navigation does not remount heavy scan UIs. */
export function KeepAlivePage({ active, children }: Props) {
  const visitedRef = useRef(active);

  if (active) {
    visitedRef.current = true;
  }

  if (!visitedRef.current) {
    return null;
  }

  return (
    <div className="keep-alive-page" hidden={!active}>
      {children}
    </div>
  );
}
