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

import { format, type SemVer } from "@std/semver";
import { fromFileUrl, join, toFileUrl } from "@std/path";
import { z } from "zod";
import type { ModuleGraph, NPMImportInfo } from "./graph.ts";
import * as npmResolver from "resolve.exports";
import { assert } from "jsr:@std/assert@^0.225.2/assert";
import { type ModuleSpecifier, parseModuleSpecifier, parseNPMExact } from "./specifier.ts";
import { has_default_export, toESM } from "./ast-ops.ts";
import type { Opt } from "./options.ts";

export const PackageJSON = z.object({
    name: z.string(),
    version: z.string(),
    main: z.unknown().optional(),
    browser: z.unknown().optional(),
    exports: z.unknown().optional(),
});
export type PackageJSON = z.infer<typeof PackageJSON>;

const cacheDir = (async () =>
    z
        .object({
            npmCache: z.string().transform(toFileUrl),
        })
        .parse(
            JSON.parse(
                new TextDecoder().decode(
                    (await new Deno.Command(Deno.execPath(), {
                        args: ["info", "--json"],
                        stdout: "piped",
                    }).output())
                        .stdout,
                ),
            ),
        )
        .npmCache)();

const pending = new Map<string, Promise<PackageJSON | null>>();

export async function getNPMPath(name: string, version: SemVer) {
    return join(fromFileUrl(await cacheDir), `registry.npmjs.org/${name}/${format(version)}`);
}

export async function getPackageMetadata(name: string, version: SemVer): Promise<PackageJSON | null> {
    const id = `${name}@${format(version)}`;
    if (pending.has(id)) {
        return await pending.get(id)!;
    } else {
        const pr = (async () => {
            const path = join(await getNPMPath(name, version), "package.json");
            const content = await Deno.readTextFile(path).catch(() => {
                return null;
            });
            if (content) {
                const data = JSON.parse(content);
                const parsed = PackageJSON.safeParse(data);
                if (parsed.success) {
                    return parsed.data;
                } else {
                    console.error(`Failed to parse package.json for ${id}`);
                    throw {
                        zod: parsed.error,
                        message: `Failed to parse package.json for ${id}`,
                        package: data,
                    };
                }
            } else {
                return null;
            }
        })();
        pending.set(id, pr);
        return await pr;
    }
}

export class NPMPackage {
    constructor(
        readonly name: string,
        readonly version: SemVer,
        readonly raw_dependencies: string[],
        readonly graph: ModuleGraph,
    ) {
        this.metadata = getPackageMetadata(name, version);
        this.dependencies.set(this.name, this);
    }
    readonly metadata;
    readonly dependencies = new Map<string, NPMPackage>();
    async fetch_metadata() {
        await this.metadata;
    }

    link() {
        for (const dep of this.raw_dependencies) {
            const pkg = this.graph.npm_packages.get(dep);
            assert(pkg, `failed to link dependency ${dep} of ${this.name}@${format(this.version)}`);
            this.dependencies.set(pkg.name, pkg);
        }
    }

    public async resolve_import(path: string): Promise<ModuleSpecifier> {
        const metadata = await this.metadata;
        const resolved = npmResolver.exports(metadata, path, {
            browser: this.graph.o.environment === "browser",
        });

        if (resolved) {
            for (const path of resolved) {
                const realPath = join(await getNPMPath(this.name, this.version), path);

                if ((await stat(realPath))?.isFile) {
                    return parseModuleSpecifier(`npm-data:${this.name}@${format(this.version)}/${path.substring(2)}`);
                }
            }
            throw new Error(`export ${path} from ${this.name}@${format(this.version)} could not be resolved`);
        } else if (path) {
            return parseModuleSpecifier(join(`npm-probe:${this.name}@${format(this.version)}/`, path));
        } else {
            const res = npmResolver.legacy(metadata, {
                browser: this.graph.o.environment === "browser",
            });
            assert(typeof res === "string", `legacy resolution failed for ${this.name}@${format(this.version)}`);
            return parseModuleSpecifier(join(`npm-probe:${this.name}@${format(this.version)}/`, res));
        }
    }
}

const npm_data_transform_cache = new Map<string, string | Promise<string>>();

export async function getNPMData(o: Opt, specifier: ModuleSpecifier) {
    if (npm_data_transform_cache.has(specifier.href)) {
        return npm_data_transform_cache.get(specifier.href)!;
    }

    const pr = getNPMDataInner(o, specifier);
    npm_data_transform_cache.set(specifier.href, pr);
    const code = await pr;
    npm_data_transform_cache.set(specifier.href, code);
    return code;
}

async function getNPMDataInner(o: Opt, specifier: ModuleSpecifier) {
    const id = parseNPMExact(specifier.pathname);
    assert(id);
    const raw_code = await Deno.readTextFile(join(await getNPMPath(id.name, id.version), id.path));
    let code = await toESM(o, raw_code, specifier.href);
    code = code.replace(/\/\/# sourceMappingURL.+/, ""); // TODO resolve source map url
    return code;
}

export async function get_npm_import_link(o: Opt, info: NPMImportInfo): Promise<string> {
    const importedCode = await getNPMData(o, info.module);

    if (await has_default_export(o, importedCode, info.specifier.href)) {
        return `
// npm:${info.package.name}@${format(info.package.version)}

export * from "${info.module.href}";
import d from "${info.module.href}";
export default d;`;
    } else {
        return `
// npm:${info.package.name}@${format(info.package.version)}

export * from "${info.module.href}";`;
    }
}

function stat(path: string | URL) {
    return Deno.stat(path).catch(() => null);
}

export async function importProbe(path: string, virtualPath: string = path) {
    const direct = await stat(path);
    if (direct?.isFile) {
        return virtualPath;
    } else if (direct?.isDirectory) {
        return await importProbe(`${path}/index`, `${virtualPath}/index`);
    } else {
        for (const ext of ["js", "mjs", "cjs"]) {
            if (await stat(`${path}.${ext}`)) {
                return `${virtualPath}.${ext}`;
            }
        }
    }
    return null;
}
