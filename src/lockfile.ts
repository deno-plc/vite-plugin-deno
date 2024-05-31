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

import { z } from "zod";
import { assertEquals } from "@std/assert";
import { ensureFile } from "@std/fs";
import { encodeBase64 } from "@std/encoding/base64";
// @deno-types=npm:@types/json-stable-stringify@1.0.36
import stringify from "json-stable-stringify";

let lockfile: Lockfile | null = null;

const LOCKFILE = "./vite.deno.lock";

let write_timeout: number = 0;
export function flush_lockfile_changes() {
    clearTimeout(write_timeout);
    write_timeout = setTimeout(async () => {
        await Deno.writeTextFile(
            LOCKFILE,
            stringify(lockfile, {
                space: 4,
            }),
        );
    }, 200);
}

const lockfile_schema = z.object({
    version: z.number().default(1),
    resolve: z.record(z.string()).default({}),
    redirect: z.record(z.string()).default({}),
    integrity: z.record(z.string()).default({}),
});
export type Lockfile = z.infer<typeof lockfile_schema>;

export async function openLockfile(): Promise<Lockfile> {
    if (!lockfile) {
        await ensureFile(LOCKFILE);
        lockfile = lockfile_schema.parse(JSON.parse(await Deno.readTextFile(LOCKFILE) || "{}"));
        if (lockfile.version) {
            assertEquals(lockfile.version, 1);
        }
    }
    return lockfile;
}

export async function edit_lockfile(fn: (lock: Lockfile) => void) {
    const lockfile = await openLockfile();
    fn(lockfile);
    lockfile.version = 1;
    flush_lockfile_changes();
}

export async function updateIntegrity(id: string, digest: Uint8Array) {
    const integrity = encodeBase64(digest);
    const lockfile = await openLockfile();

    if (lockfile.integrity[id] !== integrity) {
        lockfile.integrity[id] = integrity;
        lockfile.version = 1;
        flush_lockfile_changes();
    }
}
