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
