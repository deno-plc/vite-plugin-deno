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

import { assert } from "@std/assert";
import type { Opt } from "../options.ts";
import { fetch_immutable } from "../storage/immutable.ts";
import { getNPMMeta } from "./meta.ts";
import { extract } from "tar-stream";
// @deno-types="npm:@types/node@18.16.19"
import { createGunzip } from "node:zlib";
// @deno-types="npm:@types/node@18.16.19"
import { Buffer } from "node:buffer";
import { set_blob } from "../storage/blobfs.ts";
import { db } from "../storage/db.ts";

const loading = new Map<string, Promise<void>>();

export async function ensureTarball(o: Opt, packageName: string, version: string) {
    const id = `${packageName}@${version}`;

    if (loading.has(id)) {
        await loading.get(id)!;
    } else {
        if (db.sql`SELECT 1 FROM npm_tar WHERE package = ${packageName} AND version = ${version} LIMIT 1`.length) {
            return;
        }

        const pr = loadTarball(o, packageName, version);
        loading.set(id, pr);
        pr.then(() => {
            loading.delete(id);
        });
        await pr;
    }
}

async function loadTarball(o: Opt, packageName: string, version: string) {
    const meta = await getNPMMeta(o, packageName);
    const versionMeta = meta.versions[version];
    if (!versionMeta) {
        throw new Error(`could not load version meta for ${packageName}@${version}`);
    }
    const url = new URL(versionMeta?.dist?.tarball);
    const tgz = await fetch_immutable({
        url,
        lockfileID: `npm:${packageName}@${version}~tarball`,
    });

    assert(tgz);

    const tar = extract();

    tar.on("entry", (header: { name: string; }, stream: NodeJS.ReadableStream, cb: () => void) => {
        const path = header.name.substring("package/".length);
        // console.log(header.name);
        const data: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => {
            data.push(chunk);
        });

        stream.on("end", async () => {
            const content = new Uint8Array(Buffer.concat(data).buffer);
            const entry = await set_blob(content);
            db.sql`INSERT OR IGNORE INTO npm_tar(package,version,file,blob_ref) VALUES (${packageName}, ${version}, ${path}, ${entry.digest.sha512})`;
            cb();
        });

        stream.resume();
    });

    const gz = createGunzip();

    gz.pipe(tar);

    gz.write(tgz);

    await new Promise<void>((res) => {
        tar.on("finish", () => {
            res();
        });
    });
}
