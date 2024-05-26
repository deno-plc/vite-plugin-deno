import { assert } from "@std/assert";
import { z } from "zod";
// @deno-types="npm:@types/semver";
import { maxSatisfying, valid } from "semver";
import { flush_lockfile_changes, openLockfile } from "./lockfile.ts";
import { encodeBase64 } from "jsr:@std/encoding@^0.223.0/base64";
import { decodeHex } from "jsr:@std/encoding@^0.223.0/hex";
import { fetch_immutable } from "./storage/immutable.ts";

export interface JSRPackage {
    scope: string;
    name: string;
    version: string | null;
    path: string;
}

export function package_id(p: JSRPackage) {
    return `jsr:${p.scope}/${p.name}@${p.version}/${p.path}`.replace("@/", "/").replace(/\.\/$/, "");
}

export function parse_jsr_specifier(specifier: string): JSRPackage | null {
    if (specifier.startsWith("jsr:")) {
        specifier = specifier.substring(4);
    }
    if (specifier.charAt(0) !== "@") {
        return null;
    }
    specifier = specifier.replaceAll("\\", "/");
    const [scope, rawPackage, ...path] = specifier.split("/");
    assert(scope);
    assert(rawPackage);
    const [name, version] = rawPackage.split("@");
    assert(name);
    return {
        scope,
        name,
        version: version || "",
        path: path.join("/") || ".",
    };
}

const PackageMetadata = z.object({
    versions: z.record(z.object({
        yanked: z.boolean().default(false),
    })),
});
export type PackageMetadata = z.infer<typeof PackageMetadata>;

const package_metadata_cache = new Map<string, Promise<PackageMetadata>>();

export async function jsr_package_metadata(p: JSRPackage): Promise<PackageMetadata> {
    const packageID = `${p.scope}/${p.name}`;
    if (!package_metadata_cache.has(packageID)) {
        package_metadata_cache.set(
            packageID,
            new Promise((resolve) => {
                (async () => {
                    const metadata = PackageMetadata.safeParse(
                        await (await fetch(`https://jsr.io/${p.scope}/${p.name}/meta.json`)).json(),
                    );
                    if (metadata.success) {
                        resolve(metadata.data);
                    } else {
                        throw new Error(`invalid JSR package meta ${packageID}`);
                    }
                })();
            }),
        );
    }
    return await package_metadata_cache.get(packageID)!;
}

const version_metadata_schema = z.object({
    manifest: z.record(z.object({
        checksum: z.string(),
    })),
    exports: z.record(z.string()),
});
export type VersionMetadata = z.infer<typeof version_metadata_schema>;

const version_metadata_cache = new Map<string, VersionMetadata>();

export async function jsr_version_metadata(p: JSRPackage): Promise<VersionMetadata> {
    const packageID = package_id(p);
    if (version_metadata_cache.has(packageID)) {
        return version_metadata_cache.get(packageID)!;
    }
    const data = await fetch_immutable({
        url: `https://jsr.io/${p.scope}/${p.name}/${p.version}_meta.json`,
        lockfileID: `jsr:${p.scope}/${p.name}@${p.version}~metadata`,
    });
    const metadata = version_metadata_schema.safeParse(JSON.parse(new TextDecoder().decode(data || new Uint8Array(0))));
    if (metadata.success) {
        const lockfile = await openLockfile();
        let lock_changes = false;
        for (const file in metadata.data.manifest) {
            const lockfileID = package_id({
                ...p,
                path: file.substring(1),
            });
            if (!lockfile.integrity[lockfileID]) {
                lockfile.integrity[lockfileID] = encodeBase64(
                    decodeHex(metadata.data.manifest[file].checksum.substring(7)),
                );
                lock_changes = true;
            }
        }
        if (lock_changes) {
            flush_lockfile_changes();
        }
        version_metadata_cache.set(packageID, metadata.data);
        return metadata.data;
    } else {
        throw new Error(`invalid JSR version metadata ${p.scope}/${p.name}@${p.version}`);
    }
}

export async function fetch_jsr_file(p: JSRPackage): Promise<string> {
    const data = await fetch_immutable({
        url: `https://jsr.io/${p.scope}/${p.name}/${p.version}/${p.path}`,
        lockfileID: package_id(p),
    });
    assert(data);
    return new TextDecoder().decode(data);
}

async function resolve_jsr_version(p: JSRPackage) {
    if (valid(p.version)) {
        return p.version;
    }
    const lockfile = await openLockfile();
    const resolveID = `jsr:${p.scope}/${p.name}@${p.version}`;
    if (lockfile.resolve[resolveID]) {
        return lockfile.resolve[resolveID];
    }
    const metadata = await jsr_package_metadata(p);
    const versions: string[] = [];
    for (const version in metadata.versions) {
        versions.push(version);
    }
    const match = maxSatisfying(versions, p.version || "*");
    if (!match) {
        throw new Error(`no version satisfies ${p.version}`);
    } else if (p.version !== match) {
        lockfile.resolve[resolveID] = match;
        flush_lockfile_changes();
    }
    return match;
}

export async function resolveJSR(p: JSRPackage) {
    const version = await resolve_jsr_version(p);
    const resolved: JSRPackage = {
        ...p,
        version,
    };

    const metadata = await jsr_version_metadata(resolved);

    const export_record = metadata.exports[`./${resolved.path}`] || metadata.exports[`${resolved.path}`];
    if (export_record) {
        return resolveJSR({
            ...resolved,
            path: export_record.substring(2),
        });
    }

    const file_record = metadata.manifest[`/${resolved.path}`];
    if (file_record) {
        return package_id(resolved);
    }

    console.error(`${package_id(resolved)} has no such file ${resolved.path}`);
}
