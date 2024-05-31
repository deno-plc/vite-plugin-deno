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
import { fetch_jsr_file, parse_jsr_specifier } from "./src/jsr.ts";
import { dirname } from "jsr:@std/path@0.217";
import { resolveWithImportMap } from "./src/importmap.ts";
import type { Opt } from "./src/options.ts";
import { fetch_immutable } from "./src/storage/immutable.ts";
import { assert } from "@std/assert";
import { parseNPM } from "./src/npm/specifier.ts";
import { loadNPMFile } from "./src/npm/loader.ts";
import { join } from "@std/path";
import { readImportMap } from "./src/utils/importMap.ts";

/**
 * Plugin configuration
 */
export interface PluginDenoOptions {
    /**
     * Path to deno.json, defaults to ./deno.json
     */
    deno_json?: string;
    /**
     * list of node builtin modules and their polyfills.
     * Default: buffer => npm:buffer
     */
    nodePolyfills?: [string, string][] | Map<string, string>;
    /**
     * Plugin-Deno uses the local cache first for information about package versions, etc...
     */
    force_online?: boolean;
    /**
     * These network imports wont be resolved
     */
    cdn_imports?: string[];
    /**
     * allowed undeclared dependencies (eg. injected hmr)
     */
    allowed_undeclared_dependencies?: string[];
    /**
     * imports that are handled by other plugins
     */
    exclude?: (string | RegExp)[];
}

/**
 * plugin
 */
export async function pluginDeno(options: PluginDenoOptions = {}): Promise<Plugin> {
    const importMap = await readImportMap(options.deno_json || "./deno.json");
    const nodePolyfills = new Map(options.nodePolyfills || [["buffer", "npm:buffer"]]);
    const o: Opt = {
        importMap,
        importMapPath: options.deno_json || "./deno.json",
        force_online: options.force_online || false,
        cdn_imports: options.cdn_imports || [],
        nodePolyfills,
        undeclared_dependencies: options.allowed_undeclared_dependencies || [],
    };
    return {
        name: "vite-plugin-deno",
        enforce: "pre",
        resolveId: {
            order: "pre",
            async handler(id, importer) {
                if (options.exclude) {
                    for (const exclude of options.exclude) {
                        if (id === exclude || (exclude instanceof RegExp && exclude.test(id))) {
                            return null;
                        }
                    }
                }
                /**
                 * [issue] [flaky] Sometimes vite tries to resolve ids that contain '[object Promise]' which indicates that as Promise has been casted to string.
                 */
                if (id.includes("[object Promise]")) {
                    throw new Error(`[Plugin-Deno] cannot resolve invalid id: ${id}`);
                }

                const resolved = await resolveWithImportMap(o, id, importer);

                /**
                 * Make sure '[object Promise]' ids don't originate in plugin-deno
                 */
                if (resolved?.includes("[object Promise]")) {
                    throw new Error(`[Plugin-Deno] resolved to invalid: ${id}`);
                }
                return resolved;
            },
        },
        async load(id) {
            /**
             * https://
             */
            if (id.startsWith("remote:")) {
                id = id.replace(/https\:\/(?=[a-z])/, "https://");
                const url = id.substring(7);
                const content = await fetch_immutable({
                    url,
                    lockfileID: id,
                });
                assert(content);
                return new TextDecoder()
                    .decode(content)
                    .replace(`//# sourceMappingURL=`, `//# sourceMappingURL=${dirname(url)}/`);
            }

            if (id.startsWith("jsr:")) {
                const p = parse_jsr_specifier(id)!;
                const code = await fetch_jsr_file(p);
                return {
                    code,
                    map: null,
                };
            }

            if (id.startsWith("npm:")) {
                const p = parseNPM(id)!;
                const code = new TextDecoder().decode(await loadNPMFile(o, p));
                // load source maps (otherwise the paths would point to invalid urls)
                // Additionally vite disallows loading of paths that have not been previously imported
                const mappingStart = code.indexOf("//# sourceMappingURL=");
                let map: undefined | string = undefined;
                if (mappingStart !== -1) {
                    const mappingURL = code.substring(mappingStart + "//# sourceMappingURL=".length).split("\n")[0]!
                        .trim();
                    // data urls don't depend on path anyway
                    if (!mappingURL.startsWith("data:")) {
                        const path = join(dirname(p.path), mappingURL).replaceAll("\\", "/");
                        map = new TextDecoder().decode(
                            await loadNPMFile(o, {
                                name: p.name,
                                version: p.version,
                                path,
                            }),
                        );
                    }
                }
                return {
                    // remove old source map import
                    code: code.replace(/\/\/# sourceMappingURL=.+/, ""),
                    map,
                };
            }
        },
    };
}
