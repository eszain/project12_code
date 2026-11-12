"use client";

import dynamic from "next/dynamic";

const EarthScene = dynamic(() => import("./earth-scene").then((module) => module.EarthScene), {
  ssr: false,
  loading: () => <div className="scene-fallback" role="img" aria-label="Orbital visualization loading"><span className="fallback-orbit" /><span>Loading orbital view</span></div>,
});

export function EarthVisual() {
  return <EarthScene />;
}
