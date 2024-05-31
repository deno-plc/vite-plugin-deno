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

import { assertEquals } from "@std/assert";
import { parseNPM } from "./npm/specifier.ts";

Deno.test("parse NPM spec", () => {
    assertEquals(parseNPM("foo"), {
        name: "foo",
        version: null,
        path: "",
    });

    assertEquals(parseNPM("foo@1.0.0"), {
        name: "foo",
        version: "1.0.0",
        path: "",
    });

    assertEquals(parseNPM("@foo/bar"), {
        name: "@foo/bar",
        version: null,
        path: "",
    });

    assertEquals(parseNPM("@foo/bar@1.0.0"), {
        name: "@foo/bar",
        version: "1.0.0",
        path: "",
    });

    assertEquals(parseNPM("foo/file"), {
        name: "foo",
        version: null,
        path: "file",
    });

    assertEquals(parseNPM("foo@1.0.0/file"), {
        name: "foo",
        version: "1.0.0",
        path: "file",
    });

    assertEquals(parseNPM("@foo/bar/file"), {
        name: "@foo/bar",
        version: null,
        path: "file",
    });

    assertEquals(parseNPM("@foo/bar@1.0.0/file"), {
        name: "@foo/bar",
        version: "1.0.0",
        path: "file",
    });

    assertEquals(parseNPM("@foo/bar@1.0.0/path/file"), {
        name: "@foo/bar",
        version: "1.0.0",
        path: "path/file",
    });
});
