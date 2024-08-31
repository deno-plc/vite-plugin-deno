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
import { join, toFileUrl } from "@std/path";
import { decodeSpec, encodeSpec, resolve } from "./src/resolve.ts";
import { resolve_undeclared_npm } from "./src/undeclared_npm.ts";

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
     * 1. Controls the Node module resolution conditions (when set to `"browser"` the package.json `browser` entry is preferred over `main`)
     * 2. `node:` imports are only allowed when set to `"deno"`
     */
    env?: "deno" | "browser";

    /**
     * Those NPM packages will always be allowed even if they are not included in Deno's module graph
     */
    undeclared_npm_imports?: string[];

    /**
     * import map that is only applied to build module resolution.
     *
     * Useful for polyfilling `node:` and handling injected imports (JSX runtime, HMR, ...)
     */
    extra_import_map?: [string, string][] | Map<string, string | Promise<string>>;

    /**
     * don't touch these imports
     */
    exclude?: (string | RegExp)[];
}

/**
 * pluginDeno
 */
export function pluginDeno(options: PluginDenoOptions): Plugin {
    const extra_import_map = new Map(options.extra_import_map);
    const o: Opt = {
        deno_json: options.deno_json,
        deno_lock: options.deno_lock,
        extra_import_map,
        environment: options.env ?? "browser",
        exclude: [...options.exclude ?? []],
    };

    if (o.environment === "deno") {
        o.exclude.push(/^node:/);
    }
    o.exclude.push(/\/@fs/);
    o.exclude.push(/\/@id/);
    o.exclude.push(/\/@vite\//);
    o.exclude.push(/@vite\//);

    const graph = new ModuleGraph(o);

    resolve_undeclared_npm(options.undeclared_npm_imports ?? [], graph, extra_import_map);

    return {
        name: "vite-plugin-deno",
        enforce: "pre",
        resolveId: {
            order: "pre",
            async handler(id, referrer) {
                id = decodeSpec(id);
                referrer = referrer && decodeSpec(referrer);

                for (const exclude of o.exclude) {
                    if (exclude instanceof RegExp) {
                        if (exclude.test(id)) {
                            return null;
                        }
                        if (referrer && exclude.test(referrer)) {
                            return null;
                        }
                    }
                    if (exclude === id || exclude === referrer) {
                        return null;
                    }
                }

                if (referrer) {
                    try {
                        await Deno.stat(`${referrer}`);
                        referrer = toFileUrl(referrer).href;
                    } catch (_err) {
                        //
                    }
                } else {
                    try {
                        await Deno.stat(`./${id}`);
                        id = toFileUrl(join(Deno.cwd(), id)).href;
                    } catch (_err) {
                        //
                    }
                }

                if (id.startsWith("/")) {
                    try {
                        await Deno.stat(`.${id}`);
                    } catch (_err) {
                        return null;
                    }
                    id = toFileUrl(`${Deno.cwd()}${id}`).href;
                }

                const resolved = await resolve(o, graph, id, referrer);

                return encodeSpec(resolved);
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
