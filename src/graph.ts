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

import { join, toFileUrl } from "@std/path";
import { z } from "zod";
import type { Opt } from "./options.ts";
import { format, parse } from "@std/semver";
import { get_npm_import_link, getNPMData, getNPMPath, importProbe, NPMPackage } from "./npm.ts";
import { type ModuleSpecifier, parseModuleSpecifier, parseNPMExact, parseNPMImport } from "./specifier.ts";
import { assert } from "jsr:@std/assert@^0.225.2/assert";

const DenoInfoPosition = z.object({
    line: z.number().int().nonnegative(),
    character: z.number().int().nonnegative(),
});

const DenoInfoImport = z.object({
    specifier: z.string(),
    span: z.object({
        start: DenoInfoPosition,
        end: DenoInfoPosition,
    }),
});

const DenoInfoModule = z.union([
    z.object({
        kind: z.literal("esm"),
        specifier: z.string().transform(parseModuleSpecifier),
        mediaType: z.enum(["TypeScript", "JavaScript", "TSX"]),
        dependencies: z.object({
            specifier: z.string(),
            type: DenoInfoImport.optional(),
            code: DenoInfoImport.optional(),
        }).array().default([]),
        local: z.string().transform(toFileUrl),
        emit: z.string().transform(toFileUrl).nullable(),
        size: z.number().int().nonnegative(),
    }),
    z.object({
        kind: z.literal("asserted"),
        specifier: z.string().transform(parseModuleSpecifier),
        mediaType: z.enum(["Json"]),
        local: z.string().transform(toFileUrl),
        size: z.number().int().nonnegative(),
    }),
    z.object({
        kind: z.literal("node"),
        specifier: z.string().transform(parseModuleSpecifier),
        moduleName: z.string(),
    }),
    z.object({
        kind: z.literal("npm"),
        specifier: z.string().transform(parseModuleSpecifier),
        npmPackage: z.string(),
    }),
]);
type DenoInfoModule = z.infer<typeof DenoInfoModule>;

const DenoInfoNPMPackage = z.object({
    name: z.string(),
    version: z.string().transform((version) => parse(version)),
    dependencies: z.string().array(),
});

const DenoInfoOutput = z.object({
    roots: z.string().array(),
    modules: DenoInfoModule.array(),
    redirects: z.record(z.string().transform(parseModuleSpecifier)),
    packages: z.record(z.string()),
    npmPackages: z.record(DenoInfoNPMPackage),
});

export const npmImportKind = Symbol();
export const npmDataKind = Symbol();

export interface NPMImportInfo {
    kind: typeof npmImportKind;
    specifier: ModuleSpecifier;
    package: NPMPackage;
    module: ModuleSpecifier;
}

export interface NPMDataInfo {
    kind: typeof npmDataKind;
    specifier: ModuleSpecifier;
    package: NPMPackage;
}

export interface VirtualInfo {
    kind: typeof virtualImportKind;
    specifier: ModuleSpecifier;
    code: () => Promise<string>;
}

export class GraphModule {
    readonly specifier: ModuleSpecifier;
    readonly esm_dependencies = new Map<string, GraphModule>();
    private constructor(
        readonly def: DenoInfoModule | NPMImportInfo | NPMDataInfo | VirtualInfo,
        readonly graph: ModuleGraph,
    ) {
        this.specifier = def.specifier;

        graph.modules.set(this.specifier.href, this);

        this.load();
    }

    public static new(
        def: DenoInfoModule | NPMImportInfo | NPMDataInfo | VirtualInfo,
        graph: ModuleGraph,
    ): GraphModule {
        const spec = def.specifier.href;
        const mod = graph.modules.get(spec) || new GraphModule(def, graph);

        if (def.kind === "esm") {
            for (const dep of def.dependencies) {
                if (dep.code) {
                    graph.get_module(parseModuleSpecifier(dep.code.specifier), false).then((dep_mod) => {
                        if (dep_mod) {
                            mod.esm_dependencies.set(dep.specifier, dep_mod);
                        }
                    });
                }
            }
        }

        return mod;
    }

    private code: string | Promise<string> | null = null;

    async #load() {
        if (this.def.kind === "esm") {
            return await Deno.readTextFile(this.def.local);
        } else if (this.def.kind === npmImportKind) {
            return await get_npm_import_link(this.def);
        } else if (this.def.kind === npmDataKind) {
            return await getNPMData(this.def.specifier);
        } else if (this.def.kind === virtualImportKind) {
            return await this.def.code();
        }
        throw new Error(`module type ${this.def.kind} unsupported`);
    }

    async load(): Promise<string> {
        if (this.code) {
            return this.code;
        } else {
            const pr = this.#load();
            this.code = pr;
            const code = await pr;
            if (this.specifier.protocol === "file:") {
                this.code = null;
            } else {
                this.code = code;
            }
            return code;
        }
    }

    async resolve_import(spec: string): Promise<GraphModule | null> {
        if (this.def.kind === npmDataKind) {
            if (spec.startsWith(".")) {
                return await this.graph.get_module(
                    parseModuleSpecifier(`npm-probe:${join(this.specifier.pathname, "../", spec)}`),
                );
            } else {
                const imp = parseNPMImport(spec);
                assert(imp);
                const pkg = this.def.package.dependencies.get(imp.name);
                assert(pkg, `cannot find dependency ${imp.name} on ${this.def.package.name}`);
                return await this.graph.get_module(await pkg.resolve_import(imp.path));
            }
        } else if (this.def.kind === "esm") {
            return this.esm_dependencies.get(spec) || null;
        }
        return null;
    }
}

export class ModuleGraph {
    constructor(readonly o: Opt) {
        GraphModule.new({
            kind: virtualImportKind,
            specifier: parseModuleSpecifier("virtual:node:null"),
            code() {
                return Promise.resolve(`throw new Error("<virtual:node:null>");`);
            },
        }, this);
    }

    #pending: Promise<void> | null = null;
    readonly modules = new Map<string, GraphModule>();
    readonly #redirects = new Map<string, ModuleSpecifier>();
    readonly #npm_extended_id = new Map<string, string>();
    readonly npm_packages = new Map<string, NPMPackage>();
    readonly npm_package_versions = new Map<string, Set<string>>();

    async call_deno(root: string) {
        const args = ["info", "--json"];
        if (this.o.deno_json) {
            args.push("--config", this.o.deno_json);
        }
        if (this.o.deno_lock) {
            args.push("--lock", this.o.deno_lock);
        }
        args.push(root);
        const info = new Deno.Command(Deno.execPath(), {
            args,
            env: { DENO_NO_PACKAGE_JSON: "true" },
            stdout: "piped",
            stderr: "inherit",
        });

        const data = JSON.parse(new TextDecoder().decode((await info.output()).stdout));
        return data;
    }

    private async get_deno_info(root: string) {
        const parsed = DenoInfoOutput.safeParse(await this.call_deno(root));

        if (!parsed.success) {
            throw new Error(`invalid output of deno info ${root}`);
        }

        const { modules, redirects, npmPackages, roots } = parsed.data;

        assert(roots.length === 1);

        const waitNPM: Promise<void>[] = [];

        for (const extended_id in npmPackages) {
            const { name, version, dependencies } = npmPackages[extended_id];

            if (this.npm_package_versions.has(name)) {
                this.npm_package_versions.get(name)!.add(format(version));
            } else {
                this.npm_package_versions.set(name, new Set([format(version)]));
            }

            const npm_name = `${name}@${format(version)}`;

            {
                if (this.#npm_extended_id.has(npm_name)) {
                    if (this.#npm_extended_id.get(npm_name) !== extended_id) {
                        throw new Error(
                            `Expectation failed: underscore version extension differs while processing package '${name}'@'${
                                format(version)
                            }' processing '${extended_id}' hit '${
                                this.#npm_extended_id.get(npm_name)
                            }'. Please file an issue: https://github.com/deno-plc/vite-plugin-deno/issues/new`,
                        );
                    }
                } else {
                    this.#npm_extended_id.set(npm_name, extended_id);
                }
            }

            if (this.npm_packages.has(npm_name)) {
                continue;
            }

            const specifier = parseModuleSpecifier(`npm:${npm_name}`);

            if (npm_name !== extended_id) {
                this.#redirects.set(parseModuleSpecifier(`npm:${extended_id}`).href, specifier);
            }

            const pkg = new NPMPackage(name, version, dependencies, this);

            this.npm_packages.set(npm_name, pkg);
            this.npm_packages.set(extended_id, pkg);

            waitNPM.push(pkg.fetch_metadata());
        }

        for (const redirect in redirects) {
            this.#redirects.set(parseModuleSpecifier(redirect).href, redirects[redirect]);
        }

        // remove self-redirects
        for (const [k, v] of this.#redirects) {
            if (k === v.href) {
                this.#redirects.delete(k);
            }
        }

        Promise.all(waitNPM).then(() => {
        for (const [_id, pkg] of this.npm_packages) {
            pkg.link();
        }
        });

        for (const mod of modules) {
            if (mod.kind === "esm") {
                GraphModule.new(mod, this);
            }
        }
    }

    async update_info(specifier: ModuleSpecifier) {
        const pr = this.get_deno_info(specifier.href);
        this.#pending = pr;
        await pr;
        this.#pending = null;
    }

    async get_module(specifier: ModuleSpecifier, may_fetch: boolean = true): Promise<GraphModule | null> {
        if (this.#redirects.has(specifier.href)) {
            // console.log(`redirecting ${specifier}`);
            return await this.get_module(this.#redirects.get(specifier.href)!, may_fetch);
        }
        if (this.modules.has(specifier.href)) {
            return this.modules.get(specifier.href)!;
        }
        if (this.#pending) {
            await this.#pending;
            return await this.get_module(specifier, may_fetch);
        }
        if (specifier.protocol === "npm:") {
            const id = parseNPMExact(specifier.pathname);
            if (id) {
                const pkg = this.npm_packages.get(`${id.name}@${format(id.version)}`);
                if (pkg) {
                    const spec = await pkg.resolve_import(id.path);
                    const mod = GraphModule.new({
                        kind: npmImportKind,
                        package: pkg,
                        specifier,
                        module: spec,
                    }, this);
                    // free-running prefetch
                    this.get_module(spec, false);
                    return mod;
                }
            }
        }
        if (specifier.protocol === "npm-probe:") {
            // console.log(`%c[PROBING]        ${specifier}`, "color:#f00");
            const id = parseNPMExact(specifier.pathname);
            if (id) {
                const pkg = this.npm_packages.get(`${id.name}@${format(id.version)}`);
                if (pkg) {
                    const probe_res = await importProbe(
                        join(await getNPMPath(pkg.name, pkg.version), id.path),
                        id.path,
                    );
                    if (probe_res) {
                        const spec = parseModuleSpecifier(`npm-data:${pkg.name}@${format(pkg.version)}/${probe_res}`);
                        const mod = GraphModule.new({
                            kind: npmDataKind,
                            specifier: spec,
                            package: pkg,
                        }, this);
                        return mod;
                    }
                }
            }
            throw new Error(`Failed to probe ${specifier}`);
        }
        if (specifier.protocol === "npm-data:") {
            const id = parseNPMExact(specifier.pathname);
            if (id) {
                const pkg = this.npm_packages.get(`${id.name}@${format(id.version)}`);
                if (pkg) {
                    const mod = GraphModule.new({
                        kind: npmDataKind,
                        specifier,
                        package: pkg,
                    }, this);
                    return mod;
                }
            }
            throw new Error(`Failed to parse as npm-data: ${specifier}`);
        }
        if (may_fetch) {
            await this.update_info(specifier);
            return await this.get_module(specifier, false);
        } else {
            // console.log(`Specifier ${specifier} could not be resolved`);
            // throw new Error(`Specifier ${specifier} could not be resolved`);

            return null;
        }
    }

    get_resolved(specifier: string): GraphModule | null {
        if (this.#redirects.has(specifier)) {
            return this.get_resolved(this.#redirects.get(specifier)!.href);
        } else if (this.modules.has(specifier)) {
            return this.modules.get(specifier)!;
        } else {
            return null;
        }
    }
}
