// @deno-types=npm:@types/semver
import { maxSatisfying, valid } from "semver";
import { flush_lockfile_changes, openLockfile } from "../lockfile.ts";
import { getNPMMeta } from "./meta.ts";
import type { Opt } from "../options.ts";

export async function resolveNPMVersion(o: Opt, packageName: string, version: string): Promise<string | null> {
    if (valid(version)) {
        return version;
    }
    let resolved: string | null = null;
    const lockfile = await openLockfile();
    const id = `npm:${packageName}@${version}`.replace(/@$/, "");
    if (lockfile.resolve[id]) {
        return lockfile.resolve[id]!;
    }
    const meta = await getNPMMeta(o, packageName);
    if (!version) {
        resolved = meta["dist-tags"].latest;
    } else {
        resolved = maxSatisfying(Object.keys(meta.versions), version);
        if (!resolved) {
            if (!o.force_online) {
                return resolveNPMVersion(
                    {
                        ...o,
                        force_online: true,
                    },
                    packageName,
                    version,
                );
            } else {
                console.error(`could not resolve ${id}, no such version`);
                return null;
            }
        }
    }
    lockfile.resolve[id] = resolved;
    flush_lockfile_changes();
    return resolved;
}
