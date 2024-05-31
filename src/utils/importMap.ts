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

/**
 * Load import maps (only basic imports field supported, no includes from other files)
 * @param path path to import map file
 */
export async function readImportMap(path: string): Promise<ImportMap> {
    const content = JSON.parse(await Deno.readTextFile(path));
    const map = new Map<string, string>();
    if (content.imports && typeof content.imports === "object") {
        for (const replacedImport in content.imports) {
            map.set(replacedImport, String(content.imports[replacedImport]));
        }
    }
    return {
        lookup(id) {
            return map.get(id) ?? null;
        },
    };
}

/**
 * Parsed import map
 */
export interface ImportMap {
    lookup(id: string): string | null;
}
