// Loads CesiumJS in the browser only when the 3D view is shown (issue #26). The ready-made build in public/cesium/
// (copied there by scripts/copy-cesium.mjs) is added as a script tag, which keeps the ~6 MB library out of the app's
// bundles. Types come from the `cesium` package.

type CesiumModule = typeof import("cesium");

declare global {
  interface Window {
    Cesium?: CesiumModule;
    CESIUM_BASE_URL?: string;
  }
}

export const CESIUM_BASE_URL = "/cesium/";
let loading: Promise<CesiumModule> | null = null;

export function loadCesium(): Promise<CesiumModule> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  loading ??= new Promise<CesiumModule>((resolve, reject) => {
    // CesiumJS finds its workers and assets from this, so it must be set before the script runs.
    window.CESIUM_BASE_URL = CESIUM_BASE_URL;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${CESIUM_BASE_URL}Widgets/widgets.css`;
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = `${CESIUM_BASE_URL}Cesium.js`;
    script.async = true;
    script.onload = () => (window.Cesium ? resolve(window.Cesium) : reject(new Error("CesiumJS loaded but did not start.")));
    script.onerror = () => {
      loading = null; // allow a retry
      reject(new Error("CesiumJS could not be loaded."));
    };
    document.head.appendChild(script);
  });
  return loading;
}
