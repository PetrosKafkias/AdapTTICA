import "@fontsource-variable/geologica";
import "./local-api.js";

// The recovered application bundle contains the complete AdapTTICA interface.
// Keeping it in /public makes its original module graph portable and immutable.
// Vite's dev server refuses to serve public-directory files through its
// module-transform pipeline (the pipeline a bare `import()` goes through),
// so this loads it the way Vite documents for public assets: a <script
// type="module"> tag, which fetches it directly with no transform involved.
/** @returns {Promise<void>} */
function loadApplicationRuntime(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(script);
  });
}

await loadApplicationRuntime("/assets/index-4H71yBil.js");

const { installRuntimeEnhancements } = await import("./runtime-enhancements.js");
installRuntimeEnhancements();
