import { dirname, join } from "@std/path";
import { parse_jsr_specifier, resolveJSR } from "./jsr.ts";
import type { Opt } from "./options.ts";
import { builtinModules } from "node:module";
import { parseNPM } from "./npm/specifier.ts";
import { resolveNPMVersion } from "./npm/registry.ts";
import { getNPMMeta } from "./npm/meta.ts";
import { assert } from "@std/assert";
// @deno-types="npm:@types/semver"
import { satisfies, valid } from "semver";
import { resolveNPMExport } from "./npm/resolve.ts";

export async function resolveImport(o: Opt, id: string, importer?: string) {
    if (id.match(/^https?:\//)) {
        const url = new URL(id);
        if (o.cdn_imports.includes(url.href)) {
            return null;
        }
        return `remote:${url.href}`;
    }

    if (id.startsWith("remote:")) {
        return id;
    }

    if (builtinModules.includes(id)) {
        if (o.nodePolyfills.has(id)) {
            const polyfill = o.nodePolyfills.get(id);
            if (!polyfill || polyfill === id) {
                throw new Error(`invalid node polyfill`);
            }
            return await resolveImport(o, polyfill);
        }
    }
    if (id.startsWith("node:")) {
        if (o.nodePolyfills.has(id.substring(5))) {
            return await resolveImport(o, o.nodePolyfills.get(id.substring(5))!);
        } else {
            throw new Error(`${id} could not be polyfilled, add to config (pluginDeno({nodePolyfills: [...]}))`);
        }
    }

    if (id.startsWith("jsr:")) {
        const specifier = parse_jsr_specifier(id);
        if (!specifier) {
            console.warn(`invalid ${id}`);
            return;
        }
        return await resolveJSR(specifier);
    }

    if (id.startsWith("npm:")) {
        const p = parseNPM(id);
        const importerSpecifier = importer?.startsWith("npm:") ? parseNPM(importer) : null;
        if (!p) {
            console.warn(`invalid ${id}`);
            return;
        }

        let version = p.version || "";

        if (importerSpecifier) {
            const parentMeta = await getNPMMeta(o, importerSpecifier.name);

            const parentPackage = parentMeta.versions[importerSpecifier.version!];

            assert(parentPackage);

            const dependencyVersion = (parentPackage.dependencies || {})[p.name];
            const peerDependencyVersion = (parentPackage.peerDependencies || {})[p.name];

            if (dependencyVersion) {
                assert(
                    valid(dependencyVersion),
                    `malformed dependency '${p.name}@${dependencyVersion}' of ${importer}`,
                );
                version = dependencyVersion;
            } else if (peerDependencyVersion) {
                assert(
                    valid(peerDependencyVersion),
                    `malformed peer dependency '${p.name}@${peerDependencyVersion}' of ${importer}`,
                );
                assert(
                    satisfies(await resolveNPMVersion(o, p.name, version) || "", peerDependencyVersion),
                    `unmet peer dependency`,
                );
            } else if (o.undeclared_dependencies.includes(p.name)) {
                // do nothing
            } else {
                throw new Error(
                    `cannot load undeclared dependency ${id} from ${importer}. Add '${p.name}' to \`allowed_undeclared_dependencies\` to bypass this for injected HMR packages`,
                );
            }
        }
        const resolvedVersion = await resolveNPMVersion(o, p.name, version);

        assert(resolvedVersion);

        const meta = await getNPMMeta(o, p.name);

        const versionMeta = meta.versions[resolvedVersion];

        assert(versionMeta);

        let file = p.path;

        const exportSearch = p.path ? `./${p.path}` : ".";

        const exportEntry = versionMeta.exports?.[exportSearch];

        if (exportEntry) {
            const resolved = resolveNPMExport(exportEntry);
            if (resolved) {
                file = resolved;
            } else {
                throw new Error(`could not resolve export '${id}' from '${importer}'`);
            }
        } else if (p.path === "") {
            file = versionMeta.main;
        }

        file = file.replace(/^\.\//, "");

        // console.log(`${id} => ${file}`);
        return `npm:${p.name}@${resolvedVersion}/${file}`;
        // return await resolveJSR(specifier);
    }

    if (importer?.startsWith("jsr:")) {
        const importSpec = parse_jsr_specifier(importer);
        if (importSpec) {
            const path = join(dirname(importSpec.path), id).replaceAll("\\", "/");
            return await resolveJSR({
                ...importSpec,
                path: path,
            });
        }
    }

    if (importer?.startsWith("npm:")) {
        const importSpec = parseNPM(importer);
        if (importSpec) {
            const path = join(dirname(importSpec.path), id).replaceAll("\\", "/");
            // console.log(`%c${importer} imports ${id} (>${path})`, "color: cyan");
            return `npm:${importSpec.name}@${importSpec.version}/${path}`;
        }
    }

    if (importer?.startsWith("remote:")) {
        const url = new URL(importer.substring(7));
        url.hash = "";
        url.search = "";
        if (id.startsWith("/")) {
            url.pathname = id.substring(1);
            return `remote:${url.href}`;
        } else if (id.startsWith("./")) {
            url.pathname = join(dirname(url.pathname), id).replaceAll("\\", "/");
            return `remote:${url.href}`;
        }
    }
}
