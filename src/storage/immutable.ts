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

import { decodeBase64 } from "@std/encoding/base64";
import { flush_lockfile_changes, openLockfile, updateIntegrity } from "../lockfile.ts";
import { set_blob } from "./blobfs.ts";
import { db } from "./db.ts";
import { DoubleDigest } from "./digest.ts";

export async function fetch_immutable({ url, digest, lockfileID }: {
    url: URL | string;
    digest?: Uint8Array | DoubleDigest;
    lockfileID?: string;
}): Promise<Uint8Array | null> {
    if (typeof url === "string") {
        url = new URL(url);
    }
    const lockfile = await openLockfile();
    if (lockfile.redirect[url.href]) {
        return await fetch_immutable({ url: new URL(lockfile.redirect[url.href]), digest, lockfileID });
    }
    if (!digest && lockfile.integrity[url.href]) {
        digest = decodeBase64(lockfile.integrity[url.href]);
    }
    if (!digest && lockfile.integrity[lockfileID || "\0"]) {
        digest = decodeBase64(lockfile.integrity[lockfileID || "\0"]);
    }
    if (digest) {
        const searchDigest = digest instanceof DoubleDigest ? digest.sha512 : digest;
        const { data, sha256 } =
            db.sql`SELECT data, sha256 FROM blobs, immutable_url WHERE sha512 = blob_ref AND url = ${url.href} AND (sha256 = ${searchDigest} OR sha512 = ${searchDigest}) LIMIT 1`[
            0
            ] ?? {};
        if (data) {
            await updateIntegrity(lockfileID ?? url.href, sha256);
            return data;
        }
    }
    const content = await fetch_online(url);
    if (!content) {
        return null;
    }
    if (content.finalURL !== url.href) {
        lockfile.redirect[url.href] = content.finalURL;
        flush_lockfile_changes();
    }
    const blob = await set_blob(content.data);
    await updateIntegrity(lockfileID ?? content.finalURL, blob.digest.sha256);
    db.sql`INSERT OR IGNORE INTO immutable_url(url,blob_ref) VALUES (${content.finalURL}, ${blob.digest.sha512})`;
    if (lockfileID) {
        db.sql`INSERT OR IGNORE INTO immutable_url(url,blob_ref) VALUES (${lockfileID}, ${blob.digest.sha512})`;
    }
    return content.data;
}

const fetchQueue = new Map<string, Promise<{ data: Uint8Array; finalURL: string; } | null>>();

async function fetch_online(url: URL): Promise<{ data: Uint8Array; finalURL: string; } | null> {
    if (fetchQueue.has(url.href)) {
        return await fetchQueue.get(url.href)!;
    }
    const pr = (async () => {
        const res = await fetch(url, {
            headers: {
                "Accept":
                    "application/typescript, text/javascript, application/json, text/plain, application/octet-stream",
            },
        });

        if (res.ok) {
            return { data: new Uint8Array(await res.arrayBuffer()), finalURL: res.url };
        } else {
            return null;
        }
    })();
    fetchQueue.set(url.href, pr);
    return await pr;
}
