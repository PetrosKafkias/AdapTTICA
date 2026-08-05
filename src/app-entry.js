import "@fontsource-variable/geologica";
import "./local-api.js";

// The recovered application bundle contains the complete AdapTTICA interface.
// Keeping it in /public makes its original module graph portable and immutable.
const applicationRuntime = "/assets/index-4H71yBil.js";
await import(/* @vite-ignore */ applicationRuntime);
