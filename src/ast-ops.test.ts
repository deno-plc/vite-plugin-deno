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
import type { Opt } from "./options.ts";
import { getLogger } from "@logtape/logtape";

const o: Opt = {
    deno_json: "",
    deno_lock: "",
    extra_import_map: new Map(),
    environment: "deno",
    exclude: [],
    legacy_npm: [],
    logger: getLogger("vite-plugin-deno/test"),
};

Deno.test("has default export", async () => {
    assert(await has_default_export(o, `export default function foo(){}`) === true);
    assert(await has_default_export(o, `function foo(){}\n export {foo as default};`) === true);
    assert(await has_default_export(o, `// export default`) === false);
    assert(await has_default_export(o, `/*\nexport default\n*/`) === false);
    assert(await has_default_export(o, `// export {foo as default}`) === false);
});
