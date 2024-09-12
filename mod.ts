/**
 * @license LGPL-2.1-or-later
 *
 * vite-plugin-deno
 *
 * Copyright (C) 2024 Hans Schallmoser
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301
 * USA or see <https://www.gnu.org/licenses/>.
 */

import type { Plugin } from "vite";
import type { Opt } from "./src/options.ts";
import { ModuleGraph } from "./src/graph.ts";
import { decodeSpec, encodeSpec, resolve } from "./src/resolve.ts";
import { resolve_undeclared_npm } from "./src/undeclared_npm.ts";
import { is_excluded } from "./src/exclude.ts";

/**
 * Plugin configuration
 */
export interface PluginDenoOptions {
    /**
     * override path to deno.json
     */
    deno_json?: string;

    /**
     * override path to deno.lock
     */
    deno_lock?: string;

    /**
     * bundling context
     * 1. Controls the Node module resolution conditions (when set to `"browser"` the package.json
     * `browser` entry is preferred over `main`)
     * 2. `node:` imports are only allowed when set to `"deno"`
     */
    env?: "deno" | "browser";

    /**
     * Those NPM packages will always be allowed even if they are not included in Deno's module graph.
     *
     * This can be used to resolve packages that are imported by injected code like HMR.
     */
    undeclared_npm_imports?: string[];

    /**
     * import map that is only applied to build module resolution.
     *
     * Useful for polyfilling `node:` and handling injected imports (JSX runtime, HMR, ...)
     *
     * Sometimes it might be required to add `#standalone` to the replaced import, otherwise
     * you will get errors because the replaced import is (of course) not reported by deno info.
     * The `#standalone` instructs the plugin to treat the import like an independent entrypoint.
     */
    extra_import_map?: [string, string][] | Map<string, string | Promise<string>>;

    /**
     * All specifiers that are equal to this or match the RegExp are ignored, deferring
     * resolution to other plugins and Vite.
     *
     * Using strings is deprecated (strings are converted to RegExps anyway)
     *
     * Note that the specifiers passed to this might be in different formats (even for the
     * same one) depending on the circumstances where it is checked: It might be absolute
     * or relative, as path or `file:` URL and with or without `npm:` prefix, semver version
     * or version range.
     *
     * The RegExps should not be too expensive to check
     */
    exclude?: (string | RegExp)[];
}

/**
 * see {@link PluginDenoOptions}
 */
export function pluginDeno(options: PluginDenoOptions): Plugin {
    const extra_import_map = new Map(options.extra_import_map);
    const o: Opt = {
        deno_json: options.deno_json,
        deno_lock: options.deno_lock,
        extra_import_map,
        environment: options.env ?? "browser",
        exclude: [
            ...options.exclude?.map((excl) => {
                if (excl instanceof RegExp) {
                    return excl;
                } else {
                    // transform to regexp
                    return new RegExp(`^${excl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
                }
            }) ?? [],
        ],
    };

    if (o.environment === "deno") {
        o.exclude.push(/^node:/);
    }
    o.exclude.push(/\/@(fs|id)/);
    o.exclude.push(/\/?(@|\.)vite\//);
    o.exclude.push(/\/node_modules\//);
    o.exclude.push(/^<stdin>$/);

    const graph = new ModuleGraph(o);

    resolve_undeclared_npm(options.undeclared_npm_imports ?? [], graph, extra_import_map);

    return {
        name: "vite-plugin-deno",
        enforce: "pre",
        config() {
            if (o.environment === "deno") {
                return {
                    build: {
                        rollupOptions: {
                            external: [/^node:/],
                        },
                    },
                };
            }
        },
        resolveId: {
            order: "pre",
            async handler(id, referrer) {
                id = decodeSpec(id);
                referrer = referrer && decodeSpec(referrer);

                if (id.endsWith(".html")) {
                    return null;
                }

                if (is_excluded(id, o)) {
                    return null;
                }

                if (referrer && is_excluded(referrer, o)) {
                    return null;
                }

                const resolved = await resolve(o, graph, id, referrer);

                if (resolved) {
                    return encodeSpec(resolved);
                } else {
                    return null;
                }
            },
        },
        async load(id) {
            id = decodeSpec(id);

            const mod = graph.get_resolved(id);

            if (!mod) {
                return;
            }

            const result = await mod.load();

            return result;
        },
    };
}
