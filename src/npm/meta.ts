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

import { fetch_mutable } from "../storage/mutable.ts";
import type { Opt } from "../options.ts";
import { NPMMeta } from "./meta.schema.ts";

const cache = new Map<string, NPMMeta>();

let once = true;

export async function getNPMMeta(o: Opt, id: string) {
    if (cache.has(id)) {
        return cache.get(id)!;
    } else {
        const data = await fetch_mutable(o, new URL(`https://registry.npmjs.com/${id}`));
        if (cache.has(id)) {
            return cache.get(id)!;
        } else {
            if (!data) {
                throw new Error(`failed to fetch npm meta for ${id}`);
            }
            const meta = NPMMeta.safeParse(JSON.parse(data ?? ""));
            if (meta.success) {
                cache.set(id, meta.data);
                return meta.data;
            } else {
                if (once) {
                    once = false;
                    console.log(meta.error);
                }
                throw new Error(`invalid NPM meta for ${id}`);
            }
        }
    }
}
