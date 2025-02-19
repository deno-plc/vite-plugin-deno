/**
 * @license LGPL-2.1-or-later
 *
 * vite-plugin-deno
 *
 * Copyright (C) 2024 - 2025 Hans Schallmoser
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

import { WorkerPool } from "./ast-pool.ts";
import type { Opt } from "./options.ts";

const pool = new WorkerPool(navigator.hardwareConcurrency ?? 4);

export async function toESM(o: Opt, raw_code: string, id: string) {
    if (raw_code.includes("require") || raw_code.includes("module")) {
        return (await pool.run(o, {
            task_id: pool.get_task_id(),
            kind: "cjs-to-esm",
            id,
            raw_code,
        })).code!;
    } else {
        return raw_code;
    }
}

const default_export_cache = new Map<string, Promise<boolean> | boolean>();

export async function has_default_export(o: Opt, code: string, id: string = code): Promise<boolean> {
    if (default_export_cache.has(id)) {
        return default_export_cache.get(id)!;
    }
    if (!code.includes("default")) {
        default_export_cache.set(id, false);
        return false;
    }

    const pr = (async () =>
        (await pool.run(o, {
            task_id: pool.get_task_id(),
            kind: "default-exports",
            id,
            raw_code: code,
        })).has_default_export!)();

    default_export_cache.set(id, pr);
    const has_default_export = await pr;
    default_export_cache.set(id, has_default_export);
    return has_default_export;
}
