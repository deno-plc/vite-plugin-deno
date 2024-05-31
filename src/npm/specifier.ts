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

import validate from "npm:validate-npm-package-name";

export interface NPM {
    name: string;
    version: string | null;
    path: string;
}

export function parseNPM(spec: string): NPM | null {
    spec = spec.trim();
    if (spec.startsWith("npm:")) {
        spec = spec.substring(4);
    }
    let marker = 0;
    marker = spec.indexOf("/");
    if (spec[0] === "@") {
        // @scope/package contains one more slash
        marker = spec.indexOf("/", marker + 1);
    }
    if (marker === -1) {
        marker = Infinity;
    }
    // exclude trailing @
    const version_marker = spec.indexOf("@", 2);

    if (version_marker > marker) {
        return null;
    }

    let version = null;
    let name = spec.substring(0, marker);

    if (version_marker !== -1) {
        version = spec.substring(version_marker + 1, marker);
        name = spec.substring(0, version_marker);
    }

    const path = spec.substring(marker + 1);

    if (!validate(name)) {
        return null;
    }

    return {
        version,
        name,
        path,
    };
}
