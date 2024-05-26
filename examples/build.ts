import { pluginDeno, readImportMap } from "../mod.ts";
import { build, createServer, Plugin } from "vite";
import prefresh from "@prefresh/vite";

// import { preact } from "npm:@preact/preset-vite";
// import { readDenoConfig } from "https://esm.sh/gh/lucacasonato/esbuild_deno_loader/src/shared.ts";

// const __dirname = fileURLToPath(new URL(".", import.meta.url));

// const denoCfg = await readDenoConfig("./deno.json");

// console.log(denoCfg);

const server = await createServer({
    // any valid user config options, plus `mode` and `configFile`
    configFile: false,
    root: "./examples",
    server: {
        port: 80,
        fs: {
            // allow: [".."]
        },
    },
    plugins: [
        await pluginDeno({
            deno_json: "./deno.json",
            force_online: true,
            allowed_undeclared_dependencies: ["@prefresh/core", "@prefresh/utils"],
            exclude: [/lodash-es/],
        }),
        prefresh() as unknown as Plugin,
    ],
    esbuild: {
        jsx: "automatic",
        jsxImportSource: "preact",
    },
});
// console.log(server);
await server
    .listen();

server
    .printUrls();

// server.

// server
//     .bindCLIShortcuts({
//         print: true,
//     });
