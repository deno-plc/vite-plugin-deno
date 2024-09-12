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

import { fromFileUrl, isAbsolute, join, toFileUrl } from "@std/path";
import type { ModuleGraph } from "./graph.ts";
import { type ModuleSpecifier, parseModuleSpecifier, parseNPMImport } from "./specifier.ts";
import type { Opt } from "./options.ts";

async function exists(path: string): Promise<boolean> {
    try {
        await Deno.stat(path);
        return true;
    } catch (_) {
        return false;
    }
}

export async function resolve(
    o: Opt,
    graph: ModuleGraph,
    id: string,
    referrer?: string,
    may_fetch: boolean = true,
): Promise<ModuleSpecifier | null> {
    // console.log(`%c[RESOLVE]        ${id}`, "color:#ff0");
    if (o.extra_import_map.has(id)) {
        return await resolve(o, graph, await o.extra_import_map.get(id)!, referrer, may_fetch);
    }

    if (referrer === undefined) {
        // local entrypoint
        id = join(Deno.cwd(), id);
    }

    const fast_forward = graph.get_resolved(id);

    if (fast_forward) {
        return fast_forward.specifier;
    }

    let referrer_mod = referrer ? graph.get_resolved(referrer) : null;

    if (
        referrer && !referrer_mod && isAbsolute(referrer) && !referrer.includes(`registry.npmjs.org`) &&
        await exists(referrer)
    ) {
        referrer_mod = await graph.get_module(toFileUrl(referrer) as ModuleSpecifier);
    }

    if (id.endsWith("#standalone")) {
        const mod = await graph.get_module(parseModuleSpecifier(id.substring(0, id.length - "#standalone".length)));
        if (mod) {
            return mod.specifier;
        }
    }

    if (referrer_mod) {
        // console.log(`%c[REFERRER]       ${referrer_mod.specifier.href}`, "color: gray");
        const ref = await referrer_mod.resolve_import(id);
        if (ref) {
            return ref.specifier;
        } else {
            if (!id.startsWith("npm")) {
                if (may_fetch) {
                    await graph.update_info(referrer_mod.specifier);
                    return await resolve(o, graph, id, referrer, false);
                } else {
                    throw new Error(`cannot resolve '${id}' from ${referrer_mod.specifier.href}`);
                }
            }
        }
    }

    if (isAbsolute(id)) {
        if (await exists(id)) {
            const mod = await graph.get_module(toFileUrl(id) as ModuleSpecifier);

            if (mod) {
                // console.log(`%c[RESOLVED ABS]   ${mod.specifier.href}`, "color:blue");

                return mod.specifier;
            }
        } else {
            const project_abs = join(Deno.cwd(), id);
            if (await exists(project_abs)) {
                const mod = await graph.get_module(toFileUrl(project_abs) as ModuleSpecifier);

                if (mod) {
                    // console.log(`%c[RESOLVED ABS]   ${mod.specifier.href}`, "color:blue");

                    return mod.specifier;
                }
            }
        }
    }
    if (URL.canParse(id)) {
        const mod = await graph.get_module(parseModuleSpecifier(id));
        if (mod) {
            return mod.specifier;
        }
    }

    const npm = parseNPMImport(id);
    if (npm) {
        if (graph.npm_package_versions.has(npm.name)) {
            const versions = graph.npm_package_versions.get(npm.name)!;
            throw new Error(`cannot resolve ${id} from ${referrer}
        ${npm.name} has been recognized as an NPM package, if it is an injected import you may want to add "${npm.name}" to undeclared_npm_imports or one of the following entries to extra_import_map:
        ${
                [...versions.values()].map((version) =>
                    `"${id}" => "npm:${npm.name}@${version}${npm.path ? `/${npm.path}` : ""}"`
                ).join("\n")
            }`);
        }
    }
    if (referrer?.endsWith(".html")) {
        return null;
    }
    throw new Error(`cannot resolve ${id} from ${referrer}`);
}

const fs_remap = new Map<string, ModuleSpecifier>();

export function encodeSpec(spec: ModuleSpecifier) {
    if (spec.protocol === "file:") {
        const path = fromFileUrl(spec.href);
        fs_remap.set(path, spec);
        return path;
    }
    return `${encodeURIComponent(spec.href)}`;
}

export function decodeSpec(spec: string) {
    if (fs_remap.has(spec)) {
        return fs_remap.get(spec)!.href;
    }
    return decodeURIComponent(spec);
}
