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

import { assert } from "@std/assert";
import { has_default_export } from "./ast-ops.ts";

Deno.test("has default export", () => {
    assert(has_default_export(`export default function foo(){}`) === true);
    assert(has_default_export(`function foo(){}\n export {foo as default};`) === true);
    assert(has_default_export(`// export default`) === false);
    assert(has_default_export(`// export {foo as default}`) === false);
});
