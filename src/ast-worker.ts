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

export interface AstTask {
    task_id: number;
    kind: "cjs-to-esm" | "default-exports";
    id: string;
    raw_code: string;
}

export interface AstResult {
    task_id: number;
    code?: string;
    has_default_export?: boolean;
}

function run_task(task: AstTask): Omit<AstResult, "task_id"> {
    try {
        if (task.kind === "cjs-to-esm") {
            const { code, warnings } = transform(
                task.raw_code,
                ["commonjs"],
            );
            for (const $ of warnings) {
                if ($.msg === "export can only be at root level") {
                    throw new Error(`Failed to transform to ESM: ${task.id} does UGLY things with Cjs exports.`);
                } else {
                    console.warn(task.id, $);
                }
            }

            return {
                code,
            };
        } else {
            const ast = parse(task.raw_code, {
                ecmaVersion: 2023,
                sourceType: "module",
            });

            let has_default_export = false;

            walk_simple(ast, {
                ExportDefaultDeclaration(_node) {
                    has_default_export = true;
                },
                ExportNamedDeclaration(node) {
                    if (node.specifiers) {
                        for (const specifier of node.specifiers) {
                            // @ts-ignore missing typedef
                            if (specifier.type === "ExportSpecifier" && specifier.exported?.name === "default") {
                                has_default_export = true;
                            }
                        }
                    }
                },
            });

            return {
                has_default_export,
            };
        }
    } catch (err) {
        if (err instanceof Error) {
            throw new Error(`Failed to run task ${task.id}: ${err.message}`);
        } else {
            throw new Error(`Failed to run task ${task.id}: ${err}`);
        }
    }
}

self.onmessage = (e) => {
    const task = e.data as AstTask;

    const res: AstResult = {
        task_id: task.task_id,
        ...run_task(task),
    };

    self.postMessage(res);
};
