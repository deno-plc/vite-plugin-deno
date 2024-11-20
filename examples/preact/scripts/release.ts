import { build } from "vite";
import { config } from "./vite.ts";

await build(config);

// Vite spawns esbuild which prevents this from exiting automatically
Deno.exit(0);
