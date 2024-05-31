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

import type { Opt } from "../options.ts";
import { db } from "../storage/db.ts";
import type { NPM } from "./specifier.ts";
import { ensureTarball } from "./tarball.ts";

export async function loadNPMFile(o: Opt, p: NPM) {
    await ensureTarball(o, p.name, p.version!);

    const file = p.path;

    const rec =
        db.sql`SELECT data FROM blobs, npm_tar WHERE sha512 = blob_ref AND package = ${p.name} AND version = ${p.version} AND (file = ${file} OR file = ${file + ".js"
            } OR file = ${file + ".cjs"} OR file = ${file + ".mjs"}) LIMIT 1`[0];
    if (rec) {
        return new Uint8Array(rec.data);
    } else {
        throw new Error(`could not load '${p.name}@${p.version}/${p.path}', file does not exist`);
    }
}
