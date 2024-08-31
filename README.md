# vite-plugin-deno

Native Vite support for Deno imports (jsr:, npm:, https://).

Use Deno for the frontend and enjoy development without the hassle of `node_modules`!

## Overview

1. Enable Deno for the whole workspace

2. Adjust your Vite config to use this plugin

3. Enjoy development without `node_modules` and package managers

## How does this work?

This plugin injects a custom rollup resolver at the earliest stage possible (even before the builtin fs loader) which
catches nearly every import.

Instead of letting vite resolve the imports the plugin consults the Deno CLI (`deno info --json`). This ensures that all
imports link to exactly the same files Deno would use (including import mapping).

Additionally the plugin contains a Node.js/NPM compatible resolver (including probing and package.json exports), because
`deno info` only outputs the resolved npm package versions, not the exact files.

A custom loader is able to locate the source code for all those new specifier schemes (for example in the global deno
cache). `file:` URLs are mapped back to ordinary paths to make HMR work (Vite has no clue about `file:` URLs). The
source code of `npm:` imports is transformed from CJS to ESM if necessary.

## Supported imports

### Provided by Deno

- `./foo.ts`: relative imports
- `https://deno.land/x/foo@1.2.3/mod.ts`: HTTPS imports
- `jsr:@scope/foo`: JSR
- `npm:foo@^1.0.0`: NPM with version range
- `foo`: Mapped imports (`deno.json`>`imports`)

... and maybe imports that are not even invented yet, none of the imports above is explicitly handled by the plugin,
`deno info` tells us everything that is needed to get the module source code.

### Provided by the Plugin

- `npm:foo@1.2.3`: resolved NPM imports (including subpath imports)

The following imports are only used internally, but you may get in contact with them in the DevTools. You cannot use
them in your source code because Deno wont be able to resolve them, but you may specify them in
[`extra_import_map`](https://jsr.io/@deno-plc/vite-plugin-deno/doc/~/PluginDenoOptions.extra_import_map)

- `npm-data:foo@1.2.3/bar.js`: This references an internal file of the package tarball
- `npm-probe:foo@1.2.3/bar`: Same as above, but with probing. Will be resolved to a `npm-data:` URL

## But I need this one package to be in `node_modules`

There are various reasons why a single dependency has to reside in `node_modules`. The most popular reasons are the
Babel and PostCSS plugin loaders (they depend on `node_modules` to find the plugins) and dependency pre-bundling.

There are good news: Deno supports `node_modules`!

Read more about [package.json compatibility](https://deno.com/blog/v1.31#packagejson-support) and
[node_modules compatibility](https://docs.deno.com/runtime/manual/tools/unstable_flags/#--unstable-byonm)

If you have installed a dependency locally you can
[`exclude`](https://jsr.io/@deno-plc/vite-plugin-deno/doc/~/PluginDenoOptions.exclude) it and reenable the Vite module
resolution. This might be required for dependencies with **many** files. This plugin currently does no pre-bundling, so
every file is loaded individually, in case of `lodash-es` this results in ~650 HTTP requests.

## Usage

Currently only build script configurations are supported because `vite.config.ts` will always be run with Node :-(. It
is not that complicated as it sounds, you just have to use the JS API of Vite.

### `scripts/vite.ts`

```ts
import { pluginDeno } from "vite-plugin-deno";
import { type InlineConfig } from "vite";

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
```

### `scripts/dev.ts`:

```ts
import { createServer } from "vite";
import { config } from "./vite.ts";

const server = await createServer(config);
await server.listen();
server.printUrls();
```

### `scripts/release.ts`

```ts
import { build } from "vite";
import { config } from "./vite.ts";

await build(config);
```

### `Deno.json`

Include the DOM in the TS compiler options and define the build tasks

```json
{
    "tasks": {
        "dev": "deno run -A scripts/dev.ts",
        "release": "deno run -A scripts/release.ts"
    },
    "compilerOptions": {
        "lib": [
            "deno.window",
            "deno.ns",
            "ESNext",
            "DOM",
            "DOM.Iterable",
            "DOM.AsyncIterable",
            "webworker"
        ]
    }
}
```

## Configuration options

[> auto-generated docs](https://jsr.io/@deno-plc/vite-plugin-deno/doc/~/PluginDenoOptions)

### `deno_json` and `deno_lock`

Override the locations of `deno.json` and `deno.lock`. Passed to `deno --config ...` and `deno --lock ...`

### `env`: `"deno"` or `"browser"`(default)

Set to `"deno"` if you are bundling for Deno. This enables `node:` imports.

Set to `"browser"` (default) if you are bundling for Browsers. This prefers NPM `browser` exports.

### `undeclared_npm_imports`: `string[]`

Those packages can always be imported, even when they don't show up in the deno module graph. This can be used to
resolve packages that are imported by injected code like HMR.

### `extra_import_map`: `string` => `string`

This import map can be used to polyfill `node:` or do the same as `undeclared_npm_imports` on a more granular level.

### `exclude`: `(string | RegExp)[]`

Those imports wont be touched.

## Usage with React (coming soon)

I personally only use Preact, so this is not top priority.

Until this is supported out of the box you should be able to use the Preact configuration, it will use the React
compatibility layer. Read more: https://preactjs.com/guide/v10/switching-to-preact

If you have experience with Vite plugins and import resolving you should be able to get React working natively.

## Usage with Preact

Although `@preact/preset-vite` works when the respective Babel plugins are installed via NPM/Yarn, I do recommend
**against** using it.

With a few lines of configuration you can set up prefresh (the Preact HMR Engine) and use ESBuild for JSX
transformation.

By the way: ESBuild is many times faster than Babel and used by Vite to pre-process all files anyway (even if they are
handled by Babel)

Just update your Vite config:

```typescript
import { pluginDeno } from "@deno-plc/vite-plugin-deno";
import prefresh from "@prefresh/vite"; // HMR
import type { InlineConfig, Plugin } from "vite";

export const config: InlineConfig = {
    plugins: [
        pluginDeno({
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
        }),
        // HMR Plugin
        prefresh({
            // `node_modules` is included internally, lets do the same
            exclude: [/^npm/, /registry.npmjs.org/, /^jsr/, /^https?/],
        }) as Plugin,
    ],
    // JSX transform
    esbuild: {
        jsx: "automatic",
        jsxImportSource: "preact",
    },
};
```

And your `deno.json`:

```json
"compilerOptions": {
    "jsx": "automatic",
    "jsxImportSource": "preact",
}
```

If you want to use the Preact DevTools, follow the instructions there: https://preactjs.github.io/preact-devtools/ (it's
one import)

We need the prefresh exclude rule to replicate the internal exclude of all paths containing `node_modules`. Otherwise
prefresh would inject HMR helpers into libraries and the code that powers HMR, which causes very strange errors.

## Known limitations

### Build scripts

The classic `vite.config.ts` file would be executed using Node.js instead of Deno. Just use scripts as shown above.

### Dependency optimization

Unsupported because dependency optimization relies on `node_modules`. If you really need it (lodash), see
[But I need this one package to be in `node_modules`](#but-i-need-this-one-package-to-be-in-node_modules)

### Babel

Some other plugins require Babel and Babel plugins. The Babel plugin loader depends on `node_modules`, see
[But I need this one package to be in `node_modules`](#but-i-need-this-one-package-to-be-in-node_modules). In order to
get the best DX possible, you should avoid Babel based plugins (for most setups Babel isn't really needed, see Usage wit
Preact. Using builtin esbuild is usually way faster).

### PostCSS/TailwindCSS

`tailwindcss` currently needs to be installed in `node_modules`, see
[But I need this one package to be in `node_modules`](#but-i-need-this-one-package-to-be-in-node_modules)

The recommended way is to use Tailwind Play CDN during development and Tailwind CLI for release build.

### `Deno.stat` workaround needed (`Windows only`)

Until https://github.com/denoland/deno/issues/24899 has been resolved, you need to include the following snippet in
order to achieve the correct behavior when `node:fs.stat()` is called with an invalid file path. Otherwise you get
errors like `[vite] Pre-transform error: EINVAL: invalid argument, stat`.

```typescript
const deno_stat = Deno.stat;

Deno.stat = (...args) =>
    deno_stat(...args).catch((err) => {
        if (String(err.message).startsWith(`The filename, directory name, or volume label syntax is incorrect.`)) {
            return Deno.stat("./not-existing");
        } else {
            throw err;
        }
    });
```

## Acknowledgements

[esbuild_deno_loader](https://github.com/lucacasonato/esbuild_deno_loader) does essentially the same for esbuild. The
basic principle of operation is the same.

[resolve.exports](https://github.com/lukeed/resolve.exports) helped a lot, it handles all the `package.json` fields.

## License (LGPL-2.1-or-later)

Copyright (C) 2024 Hans Schallmoser

This library is free software; you can redistribute it and/or modify it under the terms of the GNU Lesser General Public
License as published by the Free Software Foundation; either version 2.1 of the License, or (at your option) any later
version.

This library is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more
details.

You should have received a copy of the GNU Lesser General Public License along with this library; if not, write to the
Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA or see
https://www.gnu.org/licenses/
