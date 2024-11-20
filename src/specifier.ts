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

import { parse, type SemVer } from "@std/semver";
import validate from "validate-npm-package-name";
import type { FastBrand } from "@coderspirit/nominal";

export type ModuleSpecifier = FastBrand<URL, "ModuleSpecifier">;

export function parseModuleSpecifier(inp: string | URL): ModuleSpecifier {
    const url = new URL(inp);
    if (url.href.includes("\\")) {
        return parseModuleSpecifier(url.href.replaceAll("\\", "/"));
    }
    if (url.protocol === "https:") {
        return url as ModuleSpecifier;
    } else if (url.protocol === "file:") {
        if (!url.href.startsWith("file:///")) {
            return new URL(url.href.replace("file://", "file:///")) as ModuleSpecifier;
        }
        return url as ModuleSpecifier;
    } else if (url.pathname.startsWith("/")) {
        return new URL(url.href.replace(url.pathname, url.pathname.substring(1))) as ModuleSpecifier;
    } else {
        return url as ModuleSpecifier;
    }
}

export interface NPMExact {
    name: string;
    version: SemVer;
    path: string;
}

export function parseNPMExact(spec: string): NPMExact | null {
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

    let version: SemVer | null = null;
    let name = spec.substring(0, marker);

    if (version_marker !== -1) {
        version = parse(spec.substring(version_marker + 1, marker));
        name = spec.substring(0, version_marker);
    } else {
        return null;
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

export interface NPMImport {
    name: string;
    path: string;
}

export function parseNPMImport(spec: string): NPMImport | null {
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

    const name = spec.substring(0, marker);

    const path = spec.substring(marker + 1);

    if (!validate(name)) {
        return null;
    }

    return {
        name,
        path,
    };
}
