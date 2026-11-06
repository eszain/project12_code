"use client";

import katex from "katex";
import { useMemo } from "react";

interface LatexProps {
  math: string;
  block?: boolean;
  className?: string;
}

export function Latex({ math, block = false, className = "" }: LatexProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode: block,
        throwOnError: false,
      });
    } catch {
      return math;
    }
  }, [math, block]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
