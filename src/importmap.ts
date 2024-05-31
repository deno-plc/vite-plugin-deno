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

import { dirname, join, resolve } from "@std/path";
import type { Opt } from "./options.ts";
import { resolveImport } from "./resolve.ts";

export async function resolveWithImportMap(o: Opt, id: string, importer?: string) {
    const trs = await tryImportMap(o, id, "");
    if (trs) {
        return trs;
    }

    let offset = 0;
    while (offset = id.indexOf("/", offset + 1), offset !== -1) {
        const trs = await tryImportMap(o, id.substring(0, offset), id.substring(offset));
        if (trs) {
            return trs;
        }
    }

    return await resolveImport(o, id, importer);
}

async function tryImportMap(o: Opt, mapped: string, remaining: string): Promise<string | null> {
    const importMapRef = o.importMap.lookup(mapped);
    if (importMapRef) {
        if (importMapRef.startsWith("./")) {
            // console.log(`${join(dirname(resolve(o.importMapPath)), importMapRef).replaceAll("\\", "/")}${remaining}`);
            return `${join(dirname(resolve(o.importMapPath)), importMapRef).replaceAll("\\", "/")}${remaining}`;
        }
        const wrapped = await resolveImport(o, `${importMapRef}${remaining}`);
        if (wrapped) {
            return wrapped;
        } else {
            return `${importMapRef}${remaining}`;
        }
    }
    return null;
}
