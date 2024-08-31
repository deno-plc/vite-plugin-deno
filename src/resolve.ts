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

import { fromFileUrl } from "@std/path";
import type { ModuleGraph } from "./graph.ts";
import { type ModuleSpecifier, parseModuleSpecifier, parseNPMImport } from "./specifier.ts";
import type { Opt } from "./options.ts";

export async function resolve(o: Opt, graph: ModuleGraph, id: string, referrer?: string, may_fetch: boolean = true) {
    if (o.extra_import_map.has(id)) {
        return await resolve(o, graph, await o.extra_import_map.get(id)!, referrer, may_fetch);
    }

    const referrer_mod = graph.get_resolved(referrer!);

    if (referrer_mod) {
        // console.log(`%c[REFERRER]       ${referrer_mod.specifier.href}`, "color: gray");
        const ref = await referrer_mod.resolve_import(id);
        if (ref) {
            // console.log(`%c[RESOLVED]       ${ref.specifier.href}`, "color:#ff0");
            return ref.specifier;
        } else if (!id.startsWith("npm")) {
            if (may_fetch) {
                await graph.update_info(referrer_mod.specifier);
                return await resolve(o, graph, id, referrer, false);
            } else {
                throw new Error(`cannot resolve '${id}' from ${referrer_mod.specifier.href}`);
            }
        }
    }

    if (URL.canParse(id)) {
        const mod = await graph.get_module(parseModuleSpecifier(id));

        // console.log(`%c[RESOLVED ENTRY] ${mod.specifier.href}`, "color:blue");

        return mod.specifier;
    } else {
        const maybe_npm = parseNPMImport(id);
        if (maybe_npm) {
            if (graph.npm_package_versions.has(maybe_npm.name)) {
                const versions = graph.npm_package_versions.get(maybe_npm.name)!;
                throw new Error(`cannot resolve ${id} from ${referrer}
${maybe_npm.name} has been recognized as an NPM package, if it is an injected import you may want to add "${maybe_npm.name}" to undeclared_npm_imports or one of the following entries to extra_import_map:
${
                    [...versions.values()].map((version) =>
                        `"${id}" => "npm:${maybe_npm.name}@${version}${maybe_npm.path ? `/${maybe_npm.path}` : ""}"`
                    ).join("\n")
                }`);
            }
        }
        throw new Error(`cannot resolve ${id} from ${referrer}`);
    }
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
