"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Measure the width of a container element so SVG charts can render at
 * their real size instead of relying on `preserveAspectRatio` scaling
 * (which would also scale the text).
 */
export function useElementWidth(defaultWidth = 760) {
  const ref = useRef(null);
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
