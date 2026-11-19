import { useEffect, useLayoutEffect, useRef, useState } from "react";

const ACTIVE = '[aria-selected="true"],[aria-checked="true"],[aria-pressed="true"],[data-active="true"]';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The highlight behind the selected option of a tab list or segmented
 * control. It glides from the old option to the new one, so a switch reads
 * as one thing moving rather than two buttons repainting.
 *
 * Render it as the first child of the list. The list must be `relative`;
 * options sit above the highlight with `relative z-10` and drop their own
 * selected background.
 */
export function SlidingIndicator({
  activeKey,
  className,
}: {
  /** Changes whenever the selection does, so the highlight is re-measured. */
  activeKey: unknown;
  className: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const list = ref.current?.parentElement;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>(ACTIVE);
      setBox(active
        ? { x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight }
        : null);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeKey]);

  // Placed without motion first, so it never slides in from the corner on load.
  useEffect(() => {
    if (!box || animate) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [box, animate]);

  return (
    <span
      ref={ref}
      aria-hidden
      data-testid="sliding-indicator"
      className={`pointer-events-none absolute left-0 top-0 ${box ? "" : "hidden"} ${
        animate ? "transition-[transform,width,height] duration-300 ease-out" : ""
      } ${className}`}
      style={box ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.width, height: box.height } : undefined}
    />
  );
}
