import { useRef, type PointerEvent, type ReactNode } from 'react';

// Wraps content in a container whose background radial-gradient follows the
// pointer, giving the hero a subtle "light source" the user controls.
export default function Spotlight({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      className={`relative ${className}`}
      style={{
        backgroundImage:
          'radial-gradient(600px circle at var(--spot-x, 50%) var(--spot-y, 0%), rgba(91,140,255,0.12), transparent 65%)',
      }}
    >
      {children}
    </div>
  );
}
