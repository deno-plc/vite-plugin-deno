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

/**
 * Load import maps (only basic imports field supported, no includes from other files)
 * @param path path to import map file
 */
export async function readImportMap(path: string): Promise<ImportMap> {
    const content = JSON.parse(await Deno.readTextFile(path));
    const map = new Map<string, string>();
    if (content.imports && typeof content.imports === "object") {
        for (const replacedImport in content.imports) {
            map.set(replacedImport, String(content.imports[replacedImport]));
        }
    }
    return {
        lookup(id) {
            return map.get(id) ?? null;
        },
    };
}

/**
 * Parsed import map
 */
export interface ImportMap {
    lookup(id: string): string | null;
}

/**
 * Plugin configuration
 */
export interface PluginDenoOptions {
    /**
     * Path to deno.json
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
                if (id.includes("[object Promise]")) {
                    throw new Error(`[Plugin-Deno] cannot resolve invalid id: ${id}`);
                }

                const resolved = await resolveWithImportMap(o, id, importer);
                // console.log(`%c${id} => ${resolved}`, "color: #444");
                if (resolved?.includes("[object Promise]")) {
                    throw new Error(`[Plugin-Deno] resolved to invalid: ${id}`);
                }
                return resolved;
            },
        },
        async load(id) {
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
                const mappingStart = code.indexOf("//# sourceMappingURL=");
                let map: undefined | string = undefined;
                if (mappingStart !== -1) {
                    const mappingURL = code.substring(mappingStart + "//# sourceMappingURL=".length).split("\n")[0]!
                        .trim();
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
