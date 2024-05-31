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

import type { z } from "zod";
import { NPMMeta } from "./meta.schema.ts";

function assertValid<S extends z.ZodType>(schema: S, data: unknown | z.infer<S>) {
    const p = schema.safeParse(data);
    if (p.success) {
        // fine
    } else {
        throw p.error;
    }
}

function _assertInvalid<S extends z.ZodType>(schema: S, data: unknown) {
    const p = schema.safeParse(data);
    if (p.success) {
        throw new Error(`incorrectly accepted\n${JSON.stringify(data, null, 4)}`);
    } else {
        // fine
    }
}

Deno.test("NPM Meta", () => {
    assertValid(NPMMeta, {
        name: "foo",
        "dist-tags": {
            latest: "1.2.3",
        },
        versions: {
            "1.2.3": {
                dependencies: {
                    bar: "^1.0.0",
                },
                peerDependencies: {
                    fizz: "^1.0.0",
                },
                main: "src/index.js",
                dist: {
                    tarball: "tarball",
                    integrity: "123456",
                },
                exports: {
                    ".": {
                        node: {
                            "umd": "dist/index.node.umd.js",
                        },
                    },
                    "./foo": {
                        "esm": "dist/foo.mjs",
                    },
                    "./bar": "dist/bar.js",
                },
            },
        },
    });
});
