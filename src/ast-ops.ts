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

import { transform } from "lebab";
import { parse } from "acorn";
import { simple as walk_simple } from "acorn-walk";

export function toESM(raw_code: string) {
    if (raw_code.includes("require") || raw_code.includes("module")) {
        const { code, warnings } = transform(
            raw_code,
            ["commonjs"],
        );
        for (const $ of warnings) {
            console.log($);
        }
        return code;
    }
    return raw_code;
}

const default_export_cache = new Map<string, boolean>();

export function has_default_export(code: string, id: string = code) {
    if (default_export_cache.has(id)) {
        return default_export_cache.get(id)!;
    }
    if (!code.includes("default")) {
        default_export_cache.set(id, false);
        return false;
    }

    const ast = parse(code, {
        ecmaVersion: 2023,
        sourceType: "module",
    });

    let hasDefaultExport = false;

    walk_simple(ast, {
        ExportDefaultDeclaration(_node) {
            hasDefaultExport = true;
        },
        ExportNamedDeclaration(node) {
            if (node.specifiers) {
                for (const specifier of node.specifiers) {
                    // @ts-ignore missing typedef
                    if (specifier.type === "ExportSpecifier" && specifier.exported?.name === "default") {
                        hasDefaultExport = true;
                    }
                }
            }
        },
    });

    default_export_cache.set(id, hasDefaultExport);

    return hasDefaultExport;
}
