import { pluginDeno } from "@deno-plc/vite-plugin-deno";
import prefresh from "@prefresh/vite";
import type { InlineConfig, Plugin } from "vite";

export const config: InlineConfig = {
    configFile: false, // configuration is inlined here
    server: {
        port: 8000,
    },
    plugins: [
        pluginDeno({
            exclude: [/style-import\.js/],
            env: "browser",
            undeclared_npm_imports: [
                // injected by JSX transform
                "preact/jsx-runtime",
                "preact/jsx-dev-runtime",
                // injected by HMR
                "@prefresh/core",
                "@prefresh/utils",
                // injected by react compat
                "@preact/compat",
            ],
            extra_import_map: new Map([
                // react compat
                ["react", "@preact/compat"],
                ["react-dom", "@preact/compat"],
            ]),
        }) as Plugin,
        // HMR Plugin
        prefresh({
            // `node_modules` is excluded internally, lets do the same
            exclude: [/^npm/, /registry.npmjs.org/, /^jsr/, /^https?/],
        }) as Plugin,
    ],
    esbuild: {
        jsx: "automatic",
        jsxImportSource: "preact",
    },
};
