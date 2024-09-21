# [@Deno-PLC](https://github.com/deno-plc) / [vite-plugin-deno](https://jsr.io/@deno-plc/vite-plugin-deno)

Native Vite support for Deno imports (jsr:, npm:, https://).

Use Deno for the frontend and enjoy development without the hassle of `node_modules` and package managers!

## Overview

1. Enable Deno for the whole workspace

2. Adjust your Vite config to use this plugin

3. Enjoy development without `node_modules` and package managers

## Project status

`vite-plugin-deno` can be considered 'ready' for standard setups, however in more complex setups or when using NPM
dependencies that do hacky things, builds might fail.

In this case good knowledge of module resolution is required to troubleshoot these problems. Of course I will assist you
in this process, feel free to contact [me](https://github.com/hansSchall) via GitHub or Matrix. Please always open an
Github Issue to help others in the same situation.

_**Short: Nothing fow newbies...**_

I use the plugin on my own for a quite large codebase that includes SSR, multiple frontend builds, server code bundling,
WebAssembly and a number of commonly used dependencies. This is used as a reference project for testing. While this can
never be a replacement for unit tests, a real world project is a pretty good testing playground for this kind of
software and ensures the plugin always works with the latest Deno versions (failing builds are very likely to be noticed
on my biggest project...).

## How does this work?

This plugin injects a custom rollup resolver at the earliest stage possible (even before the builtin fs loader) which
catches nearly every import.

Instead of letting Vite resolve the imports the plugin consults the Deno CLI (`deno info --json`). This ensures that all
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

- `npm-data:foo@1.2.3/bar.js`: This references an internal file of the package tarball (remember, not all files in an
  NPM package can be imported from the outside)
- `npm-probe:foo@1.2.3/bar`: Same as above, but with probing. Will be resolved to a `npm-data:` URL

## Usage

Currently only build script configurations are supported because `vite.config.ts` will always be run with Node :-(. It
is not that complicated as it sounds, you just have to use the JS API of Vite.

### `scripts/vite.ts`

```ts
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

This can be a anything the `Map` constructor supports. (yes, we use a Map for the import map)

This import map can be used to polyfill `node:` (for details see [here](#polyfilling-node)) or do the same as
`undeclared_npm_imports` on a more granular level.

Sometimes it might be required to add `#standalone` to the replaced import, otherwise you will get errors because the
replaced import is (of course) not reported by `deno info`. The `#standalone` instructs the plugin to treat the import
like an independent entrypoint.

### `exclude`: `(string | RegExp)[]`

Those imports wont be touched. RegExps are preferred (strings are converted to RegExps anyway)

## `node_modules`

This plugin works without `node_modules` most of the time, but in some cases this directory is required to make thins
work.

There are various reasons why a dependency has to reside in `node_modules`. The most popular reasons are the Babel and
PostCSS plugin loaders (they depend on `node_modules` to find the plugins) and dependency pre-bundling.

There are good news: Deno supports `node_modules` natively! (= you don't even need Node.js and NPM)

Just create a `package.json` and add items to the dependencies section. The next time Deno runs, it will create a
`node_modules` dir and symlink all packages to the global deno cache. Now all the plugin resolvers are happy!

Sometimes it might be required to use `node_modules` for a regular dependency of you app. This might be required for
packages with _**a lot of**_ files (like lodash) or if the package does crazy things with CommonJS (in this case the
plugin fails to import it, because it is unable to transform it to ESM).

After adding the dependency to the `dependencies` section of `package.json` (do this manually, not using the npm CLI),
you can [`exclude`](https://jsr.io/@deno-plc/vite-plugin-deno/doc/~/PluginDenoOptions.exclude) it from this plugin. This
re-enables Vite's module resolution.

## Polyfilling `node:`

This plugin does not automatically polyfill `node:` in browsers, but you can easily do so by setting `extra_import_map`.

Unfortunately most polyfill packages do crazy things with exports (I tested `buffer` and `util`, both didn't worked out
of the box for different reasons). This is why it is not as straightforward as mapping `node:buffer` to `npm:buffer`

1. Select an appropriate polyfill package (likely on NPM)
2. Look up its most recent version
3. link it in `extra_import_map`: `"node:buffer", "https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm#standalone"`

We use a https:// import to get rid of CommonJS issues, but in the end it is just a Deno remote import (=Deno downloads
the file, no CDN import)

Make sure to add [`#standalone`](#extra_import_map-string--string) to the replaced import.

In case you don't want to polyfill a module and instead let the import fail, redirect it to `virtual:node:null` (this
time without `#standalone`). This makes Vite happy but any attempt to load the module will fail with an error (It
resolves to a file that just contains a `throw` statement). This is useful if a package does feature detection: It tries
to dynamically import `node:fs` (or any other module), if it succeeds it uses the filesystem and if it fails it simply
doesn't do anything filesystem-related. This mechanism is used by many packages that use the filesystem when used with
Node/Deno, but work in browsers, too.

## Usage with React

Currently React is unsupported.

1. The Deno LSP has problems with React. It is about missing JSXRuntime types...
2. `react-dom` does some extremely ugly things with cjs exports (like exporting inside an if statement ...). For this
   reason it cannot be transformed to ESM correctly. At the same time it needs to be linked by JSX which makes it
   extremely difficult to use it via the `node_modules` fallback.

I personally only use Preact, so this is not top priority.

Until this is supported out of the box you could use the [Preact configuration](#usage-with-preact). If you are doing
this, all react imports are redirected to preact and the whole application is run with the react compatibility layer...
(this works without any problems 🤯) Read more: https://preactjs.com/guide/v10/switching-to-preact. You do not need to
care about the bundler setup shown there, the setup [below](#usage-with-preact) already configures everything.

If you really need React, please file an issue. This should be a very rare case because the `preact/compat` layer covers
nearly the whole React API. By the way, Preact is a bit faster than React...

## Usage with Preact

Although `@preact/preset-vite` works when the respective Babel plugins are linked via `node_modules`, I do recommend
_**against**_ using it.

With a only few lines of configuration you can do exactly the same. By the way: this speeds up the development server a
lot, because it uses ESBuild instead of Babel

Just update your Vite config to set up prefresh (the Preact HMR Engine) and ESBuild for JSX transformation:

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
            // `node_modules` is excluded internally, lets do the same
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
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
}
```

If you want to use the Preact DevTools, follow the instructions there: https://preactjs.github.io/preact-devtools/ (it's
one import)

We need the prefresh exclude rule to replicate the internal exclude of all paths containing `node_modules`. Otherwise
prefresh would inject HMR helpers into libraries and the code that powers HMR, which causes very strange errors.

If you are on Windows, a [little workaround](#denostat-workaround-needed-windows-only) is required.

## Usage with Deno (Code bundling)

Just set the `env` option to `deno`, everything should work out of the box! (even with `node:` imports)

This can replace `deno bundle`.

If you want a lightweight solution, check out
[esbuild_deno_loader](https://github.com/lucacasonato/esbuild_deno_loader), which is exactly the same for esbuild.

## FAQ / Known limitations

### React does not work (and maybe more packages that do ugly things with exports)

See [Usage with React](#usage-with-react)

For other packages it might be possible to use the [`node_modules` fallback](#node_modules)

### Build scripts

The classic `vite.config.ts` file would be executed using Node.js instead of Deno. Just use scripts as shown above.

### Dependency optimization

Unsupported because dependency optimization relies on `node_modules`. If you really need it (lodash), see
[`node_modules` section](#node_modules)

### Babel/PostCSS

Some other plugins require Babel or PostCSS or one of their plugins. Their plugin loaders depend on `node_modules`, see
[`node_modules` section](#node_modules).

In order to get the best DX possible, you should avoid Babel based plugins. For most setups Babel isn't really needed,
see [Usage wit Preact](#usage-with-preact). Using builtin esbuild is usually many times faster.

### TailwindCSS

The `tailwindcss` PostCSS plugin currently needs to be installed in `node_modules`, see
[`node_modules` section](#node_modules)

The recommended way is to use [Tailwind Play CDN](https://tailwindcss.com/docs/installation/play-cdn) during development
and the [Tailwind CLI](https://tailwindcss.com/docs/installation) for release build.

### `Deno.stat` workaround needed (`Windows only`)

Until https://github.com/denoland/deno/issues/24899 has been resolved, you need to include the following snippet in
order to achieve the correct behavior when `node:fs.stat()` is called with an invalid file path. Otherwise you get
errors like `[vite] Pre-transform error: EINVAL: invalid argument, stat`.

It is recommended to put the following snippet in the Vite config file. This way it is automatically included only if
necessary.

```typescript
const deno_stat = Deno.stat;

Deno.stat = (...args) =>
    deno_stat(...args).catch((err) => {
        if (String(err.message).startsWith(`The filename, directory name, or volume label syntax is incorrect.`)) {
            // Make sure the path `not-existing` really does not exist :-)
            return Deno.stat("./not-existing");
        } else {
            throw err;
        }
    });
```

## Acknowledgements

[esbuild_deno_loader](https://github.com/lucacasonato/esbuild_deno_loader) does exactly the same for esbuild. The basic
principle of operation is the same.

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
