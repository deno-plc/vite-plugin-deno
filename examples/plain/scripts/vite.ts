import { pluginDeno } from "@deno-plc/vite-plugin-deno";
import type { InlineConfig } from "vite";

export const config: InlineConfig = {
    configFile: false, // configuration is inlined here
    server: {
        port: 80,
    },
    plugins: [
        pluginDeno({
            // see configuration docs
        }),
    ],
};