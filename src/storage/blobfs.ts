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

import { db } from "./db.ts";
import { DoubleDigest } from "./digest.ts";
import { encodeBase58 } from "@std/encoding/base58";

export interface BlobEntry {
    digest: DoubleDigest;
    data: Uint8Array;
}

export function get_blob(digest: Uint8Array | DoubleDigest): BlobEntry | null {
    if (digest instanceof DoubleDigest) {
        const hit = db.sql`SELECT data
            FROM blobs
            WHERE sha512 = ${digest.sha512}`;

        if (hit[0]) {
            return {
                data: hit[0].data,
                digest,
            };
        }
    } else {
        const hit = db.sql`SELECT data, sha256, sha512 
            FROM blobs
            WHERE sha256 = ${digest} 
                OR sha512 = ${digest}`;

        if (hit[0]) {
            return {
                data: hit[0].data,
                digest: DoubleDigest.from(hit[0].sha256, hit[0].sha512),
            };
        }
    }
    return null;
}

export function has_blob(digest: Uint8Array | DoubleDigest): boolean {
    if (digest instanceof DoubleDigest) {
        const hit = db.sql`SELECT 1 
            FROM blobs
            WHERE sha512 = ${digest.sha512} 
            LIMIT 1`;

        if (hit.length) {
            return true;
        }
    } else {
        const hit = db.sql`SELECT 1 
            FROM blobs
            WHERE sha256 = ${digest} 
                OR sha512 = ${digest} 
            LIMIT 1`;

        if (hit.length) {
            return true;
        }
    }
    return false;
}

export function getBlobList() {
    return db.sql`SELECT blobs.sha256, blobs.sha512, mime
        FROM blobs, blob_default_mime 
        WHERE blobs.sha512 = blob_default_mime.sha512`
        .map(($) => ({
            sha256: encodeBase58($.sha256),
            sha512: encodeBase58($.sha512),
            mime: $.mime,
        }));
}

export function double_from_sha256(sha256: Uint8Array): DoubleDigest | null {
    const hit = db.sql`SELECT sha512 
        FROM blobs
        WHERE sha256 = ${sha256}`;

    if (hit[0]) {
        return DoubleDigest.from(sha256, hit[0].sha512);
    }
    return null;
}

export function double_from_sha512(sha512: Uint8Array): DoubleDigest | null {
    const hit = db.sql`SELECT sha256 
        FROM blobs
        WHERE sha512 = ${sha512}`;

    if (hit[0]) {
        return DoubleDigest.from(hit[0].sha256, sha512);
    }
    return null;
}

export function double_from_digest(digest: Uint8Array): DoubleDigest | null {
    const hit = db.sql`SELECT sha256, sha512
        FROM blobs
        WHERE sha256 = ${digest} 
            OR sha512 = ${digest}`;

    if (hit[0]) {
        return DoubleDigest.from(hit[0].sha256, hit[0].sha512);
    }
    return null;
}

export async function set_blob(data: Uint8Array): Promise<BlobEntry> {
    const sha256 = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    const sha512 = new Uint8Array(await crypto.subtle.digest("SHA-512", data));
    const existing = db.sql`SELECT 1 
        FROM blobs
        WHERE sha512 = ${sha512} 
        LIMIT 1`;

    if (existing.length === 0) {
        db.sql`INSERT INTO blobs(sha256,sha512,data)
            VALUES(${sha256},${sha512},${data})`;
    }
    return {
        digest: DoubleDigest.from(sha256, sha512),
        data,
    };
}
