/**
 * @license LGPL-2.1-or-later
 *
 * vite-plugin-deno
 *
 * Copyright (C) 2024 - 2025 Hans Schallmoser
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

import type { HmrContext, PluginOption } from "vite";
import type { Opt } from "./src/options.ts";
import { ModuleGraph } from "./src/graph.ts";
import { decodeSpec, encodeSpec, resolve } from "./src/resolve.ts";
import { resolve_undeclared_npm } from "./src/undeclared_npm.ts";
import { is_excluded } from "./src/exclude.ts";
import { getLogger } from "@logtape/logtape";
import { Ray } from "./src/ray.ts";

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
     * Those npm dependencies are left over to vite for resolution. This requires a `node_nodules` folder (like the symlinked one deno generates)
     */
    legacy_npm?: string[];

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

    /**
     * @logtape/logtape logger id
     * @default "vite-plugin-deno"
     */
    log_id?: string;

    /**
     * Minimum time in milliseconds between hot updates, see Issue #5
     * @default 0
     */
    hot_update_min_time?: number;
}

/**
 * see {@link PluginDenoOptions}
 */
export function pluginDeno(options: PluginDenoOptions): PluginOption {
    const extra_import_map = new Map(options.extra_import_map);
    const o: Opt = {
        logger: getLogger(options.log_id ?? "vite-plugin-deno"),
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
        legacy_npm: options.legacy_npm ?? [],
    };

    const legacy_npm_regex = new RegExp(`"npm:(${o.legacy_npm.join("|")})(@.+)"`, "g");

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
        // @ts-ignore some of the Plugin type definitions do not include name
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
            async handler(raw_id: string, raw_referrer: string | undefined) {
                const start = performance.now();
                const id = decodeSpec(raw_id);
                const referrer = raw_referrer && decodeSpec(raw_referrer);

                o.logger.debug(
                    `Resolve module {id}${id !== raw_id ? `({raw_id})` : ""} from {referrer}${
                        referrer !== raw_referrer ? `({raw_referrer})` : ""
                    }`,
                    {
                        id,
                        raw_id,
                        referrer,
                        raw_referrer,
                    },
                );

                const ray = new Ray(id, referrer ?? "");

                if (id.endsWith(".html")) {
                    return null;
                }

                if (is_excluded(id, o)) {
                    o.logger.debug(`skipping (excluded specifier) {id}`, { ...ray });
                    return null;
                }

                if (referrer && is_excluded(referrer, o)) {
                    o.logger.debug(`skipping (excluded referrer) {id} from {referrer}`, { ...ray });
                    return null;
                }

                if (o.legacy_npm.includes(id)) {
                    o.logger.info(`skipping (legacy npm) {id}`, { ...ray });
                    return null;
                }

                const resolved = await resolve(o, ray, graph, id, referrer);

                if (resolved) {
                    o.logger.debug(`resolved {id} from {referrer} to {resolved} ({duration}ms)`, {
                        ...ray,
                        resolved: resolved.href,
                        duration: performance.now() - start,
                    });
                    const encoded = encodeSpec(resolved);

                    /**
                     * Does not work with workspaces, because workspace imports would be skipped
                     */
                    // if (resolved.protocol === "file:" && referrer?.startsWith("file://")) {
                    //     o.logger.debug(`resolved file specifier {id} from {referrer} to {resolved} ({duration}ms)`, {
                    //         ...ray,
                    //         resolved: resolved.href,
                    //         duration: performance.now() - start,
                    //     });
                    // return null;
                    // }

                    return encoded;
                } else {
                    return null;
                }
            },
        },
        async load(raw_id: string) {
            const id = decodeSpec(raw_id);
            // const id = decodeURIComponent(raw_id);
            o.logger.debug(`Loading module {id}({raw_id})`, { id, raw_id });

            const mod = graph.get_resolved(id);

            if (!mod) {
                o.logger.warn(`[loader] failed to resolve {id}`, { id });
                return;
            }

            let result = await mod.load();

            result = result.replaceAll(legacy_npm_regex, (_, package_name) => `"${package_name}"`);

            if (id.startsWith("http")) {
                result = result.replace(/\/\/# sourceMappingURL.+/, "");
            }

            o.logger.debug(`loaded {id}`, { id });

            return result;
        },
        handleHotUpdate(ctx: HmrContext) {
            // console.log({ ...ctx, server: undefined, read: undefined, modules: undefined });
            const last_file_update = last_update.get(ctx.file);
            last_update.set(ctx.file, ctx.timestamp);

            if (last_file_update && (ctx.timestamp - last_file_update) < (options.hot_update_min_time ?? 0)) {
                o.logger.error(`skipping HMR update for {file}, too early (d={diff})`, {
                    file: ctx.file,
                    last_update: last_file_update,
                    timestamp: ctx.timestamp,
                    hot_update_min_time: options.hot_update_min_time,
                    diff: ctx.timestamp - last_file_update,
                });
                return [];
            }
        },
    };
}

const last_update = new Map<string, number>();
