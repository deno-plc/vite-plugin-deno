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

import { Database } from "@db/sqlite";
import { ensureDirSync } from "@std/fs";
import { resolve } from "@std/path";
import system_cache_dir from "https://deno.land/x/dir@1.5.2/cache_dir/mod.ts";

const cache_dir: string = Deno.env.has("VITE_PLUGIN_DENO_CACHE")
    ? Deno.env.get("VITE_PLUGIN_DENO_CACHE")!
    : `${system_cache_dir()}/vite-plugin-deno-cache`;

ensureDirSync(cache_dir);
export const db = new Database(resolve(cache_dir, "cache.sqlite3"));

db.sql`CREATE TABLE IF NOT EXISTS blobs (
    sha256 BLOB UNIQUE NOT NULL,
    sha512 BLOB PRIMARY KEY NOT NULL,
    data BLOB UNIQUE NOT NULL
)`;

db.sql`CREATE TABLE IF NOT EXISTS immutable_url (
    url TEXT NOT NULL PRIMARY KEY,
    blob_ref BLOB NOT NULL,
    FOREIGN KEY (blob_ref) REFERENCES blobs(sha512)
)`;

db.sql`CREATE TABLE IF NOT EXISTS mutable_url (
    url TEXT NOT NULL PRIMARY KEY,
    blob_ref BLOB NOT NULL,
    FOREIGN KEY (blob_ref) REFERENCES blobs(sha512)
)`;

db.sql`CREATE TABLE IF NOT EXISTS npm_tar (
    package TEXT NOT NULL,
    version TEXT NOT NULL,
    file TEXT NOT NULL,
    blob_ref BLOB NOT NULL,
    PRIMARY KEY(package,version,file),
    FOREIGN KEY (blob_ref) REFERENCES blobs(sha512)
)`;

db.sql`CREATE TABLE IF NOT EXISTS npm_version_meta (
    package TEXT NOT NULL,
    version TEXT NOT NULL,
    blob_ref BLOB NOT NULL,
    PRIMARY KEY(package,version),
    FOREIGN KEY (blob_ref) REFERENCES blobs(sha512)
)`;
