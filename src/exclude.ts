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

import type { Opt } from "./options.ts";

function is_excluded_inner(spec: string, o: Opt) {
    for (const exclude of o.exclude) {
        if (exclude.test(spec)) {
            return true;
        }
    }
    return false;
}

const cache = new Map<string, boolean>();

export function is_excluded(spec: string, o: Opt): boolean {
    return cache.get(spec) ?? (() => {
        const excl = is_excluded_inner(spec, o);
        cache.set(spec, excl);
        return excl;
    })();
}

// function* cache_info() {
//     for (const [id, excl] of cache) {
//         yield `${excl ? "-" : "+"} ${id}`;
//     }
// }
