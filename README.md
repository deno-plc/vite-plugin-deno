# vite-plugin-deno

Native Vite support for Deno imports (jsr:, npm:, https://).

Use the Deno for the frontend and enjoy development without the hassle of `node_modules`!

## Overview

1. Enable Deno for the whole workspace or at least the frontend

2. Adjust your Vite config to use this plugin

3. Enjoy development without `node_modules`

## How does this work?

This plugin consists of a custom rollup loader that is injected at the earliest stage possible (even before the builtin
fs loader). It catches every import that:

- starts with `jsr:`
- starts with `npm:`
- starts with `node:` (will be replaced by a polyfill package)
- starts with `remote:` or `https://`[^1]
- originates from an import fulfilling the above criteria (e.g. `import {foo} from "./foo.ts"` inside
  `jsr:@foo/bar@1.2.3/mod.ts`)
- is included in the deno.json import map
- is not explicitly excluded

All files are cached in a global cache file (one big SQLite DB). The cache location can be configured via
`VITE_PLUGIN_DENO_CACHE`. All information about file integrity, resolved versions and HTTP redirects is stored in a
separate lockfile (`vite.deno.lock` in the project dir). The plugin does not share lockfiles or cache with Deno.

[^1]: Although `remote:` does not work with Deno, vite-plugin-deno rewrites all `https://` imports to `remote:https://`
in order to simplify internal handling.

## Package resolution

The package resolution and even the download is handled on-the-fly: If the plugin encounters a semver range that has not
already been resolved (entry in the `resolve` section of `vite.deno.lock`) it consults the respective registry for a
list of all versions and chooses the newest matching version.

Vite-plugin-deno will always respect semver, but the exact version might differ from the one Deno (or NPM) chooses,
because the lockfiles are not synced. Do not be confused if this happens, if this causes problems you should adjust the
respective semver range (that is exactly what they were introduced for).

In order to minimize problems with version resolution it is recommended to use `deno add ...` (equivalent to
`npm install ...`)

To manually control package resolution, edit the `resolve` section of `vite.deno.lock`. Proceed with _**EXTREME
CAUTION**_, because it is possible to resolve a version range with a completely unrelated or not existing one. (e.g.
`foo@^2.0.0` might be resolved as `foo@1.2.3` or `foo@=1.2.3` as `foo@3.2.1`).

Sometimes a package does not specify all of its dependencies (which is considered bad practice), in this case the plugin
will refuse to resolve the import because it has no information about the required version. Sometimes HMR support
injects additional code with imports to HMR frontend code which replicates the same behavior. In this case the
`allowed_undeclared_dependencies` option should be used, which treats those as a dependency of the _project_. See _Usage
with Preact_ below.

In general the package resolution is pretty robust and has been shown to handle even very complex dependency trees. The
main reason why I have built this was because I had problems with a JSR package which depends on a NPM package which
requires preact as as peer dependency. The JSR compatibility layer was not able to handle this situation correctly (it
duplicated preact, but in this case preact usually throws Errors like:
`cannot read properties of undefined, reading '__h' on 'C', 'C' is undefined`) In case you encounter any problems (not
only regarding to package resolution) please file an issue

## Usage

[> Configuration options documentation](https://jsr.io/@deno-plc/vite-plugin-deno/doc/~/PluginDenoOptions)

Currently only build script configurations are supported because `vite.config.ts` will always be run with Node :-(. It
is not that complicated as it sounds, you just have to use the JS API of Vite

### `build.config.ts`

```ts
import { pluginDeno } from "vite-plugin-deno";
import { type InlineConfig } from "vite";

export const config: InlineConfig = {
    configFile: false,
    server: {
        port: 80,
    },
    plugins: [
        await pluginDeno({
            // options
        }),
    ],
};
```

### `build.dev.ts`:

```ts
import { createServer } from "vite";
import { config } from "./build.config.ts";

const server = await createServer(config);
await server.listen();
server.printUrls();
```

### `build.release.ts`

```ts
import { build } from "vite";
import { config } from "./build.config.ts";

await build(config);
```

### `Deno.json`

Include the DOM in the TS compiler options

```json
"compilerOptions": {
    "lib": [
        "deno.window",
        "deno.ns",
        "ESNext",
        "DOM",
        "DOM.Iterable",
        "webworker"
    ]
}
```

## Usage with React

// coming soon

## Usage with Preact

Although `@preact/preset-vite` works when the respective Babel plugins are installed via NPM/Yarn, I do recommend
against using it. You can achieve the same results with a few lines configuration without having to use `node_modules`.
By the way, this will speed up your build process a lot because is uses ESBuild instead of Babel.

Add this to your Vite config:

```typescript
import { pluginDeno } from "@deno-plc/vite-plugin-deno";
import prefresh from "@prefresh/vite"; // HMR
import type { InlineConfig, Plugin } from "vite";

export const config: InlineConfig = {
    // React aliasing
    resolve: {
        alias: [
            {
                find: "react",
                replacement: "@preact/compat",
            },
            {
                find: "react-dom",
                replacement: "@preact/compat",
            },
        ],
    },
    plugins: [
        await pluginDeno({
            allowed_undeclared_dependencies: ["@prefresh/core", "@prefresh/utils"], // injected HMR code
        }),
        // HMR Plugin
        prefresh({
            exclude: [/^npm:/, /registry.npmjs.org/, /^jsr:/], // see below
        }) as Plugin,
    ],
    // JSX transform
    esbuild: {
        jsx: "automatic",
        jsxImportSource: "preact",
    },
};
```

And this to your `deno.json`:

```json
"compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
}
```

If you want to use the Preact DevTools, follow the instructions there: https://preactjs.github.io/preact-devtools/ (it's
one import)

We need the prefresh exclude rule to replicate the internal exclude of all paths containing `node_modules`. Otherwise
prefresh would inject HMR helpers into the code that powers HMR, which causes strange and hard to debug ReferenceErrors.

## Known limitations

### Build scripts

The classic `vite.config.ts` file would be executed using Node.js instead of Deno. Just use scripts as shown above.

### Dependency optimization

Unsupported because dependency optimization depends on `node_modules`. If you really need it (lodash), exclude the
dependency (`exclude: [/lodash-es/]`) and install it via NPM/Yarn.

### Babel

Some other plugins require Babel and Babel plugins. The Babel plugin loader depends on `node_modules`, so you have to
install these using NPM/Yarn. In order to get the best DX possible, you should avoid Babel based plugins (for most
setups Babel isn't really needed, see Usage wit Preact).

### PostCSS/TailwindCSS

`tailwindcss` currently needs to be installed via NPM/Yarn, otherwise the PostCSS plugin loader is unable to find it.
You could also use the Tailwind Play CDN during development.

### `Deno.stat` workaround needed

Until https://github.com/denoland/deno/issues/24899 has been resolved, you need to include the following snippet in
order to achieve the correct behavior when `node:fs.stat()` is called with an invalid file path. Otherwise you get
errors like `[vite] Pre-transform error: EINVAL: invalid argument, stat`.

```typescript
const deno_stat = Deno.stat;

Deno.stat = (...args) => {
    const path = args[0].toString().replaceAll("\\", "/");

    if (path.includes("/jsr:@")) {
        return deno_stat("./not-existing");
    } else {
        return deno_stat(...args);
    }
};
```

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
