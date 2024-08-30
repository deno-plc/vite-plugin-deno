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
     * import map that is only applied to vite resolution. Useful for polyfilling `node:`
     */
    extra_import_map?: [string, string][] | Map<string, string>;

    /**
     * environment (controls the NPM entrypoint, node:, ...)
     */
    env: "deno" | "browser";

    /**
     * imports that are handled by other plugins
     */
    exclude?: (string | RegExp)[];
}

/**
 * pluginDeno
 */
export function pluginDeno(options: PluginDenoOptions): Plugin {
    const extra_import_map = new Map(options.extra_import_map || [["buffer", "npm:buffer"]]);
    const o: Opt = {
        deno_json: options.deno_json,
        deno_lock: options.deno_lock,
        extra_import_map,
        environment: options.env,
        exclude: [...options.exclude || []],
    };
    if (o.environment === "deno") {
        o.exclude.push(/^node:/);
    }
    const graph = new ModuleGraph(o);
    return {
        name: "vite-plugin-deno",
        enforce: "pre",
        resolveId: {
            order: "pre",
            async handler(id, referrer) {
                // console.log(`%c[HANDLE]         ${id}`, "color:orange");
                // console.log(`%c            from ${referrer}`, "color:orange");
                id = decodeSpec(id);
                referrer = referrer && decodeSpec(referrer);

                if (id.startsWith("/@fs")) {
                    return null;
                }
                if (id.startsWith("/@id")) {
                    return null;
                }
                if (id.startsWith("/@vite/")) {
                    return null;
                }
                if (id.startsWith("@vite/")) {
                    return null;
                }

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
                        // console.log(`%c[NOT EXISTING]   ${id}`, "color:red");
                        return null;
                    }
                    id = toFileUrl(`${Deno.cwd()}${id}`).href;
                }

                // console.log(`%c[RESOLVING]      ${id}`, "color:#f0a");
                // console.log(`%c            from ${referrer}`, "color:#f0a");

                const resolved = await resolve(o, graph, id, referrer);

                return encodeSpec(resolved);
            },
        },
        async load(id) {
            id = decodeSpec(id);
            // console.log(`%c[LOADING]        ${id}`, "color:green");

            const mod = graph.get_resolved(id);

            if (!mod) {
                // console.log(`%c[NOT RESOLVED]   ${id}`, "color: red");
                return;
            }

            return await mod.load();
        },
    };
}
