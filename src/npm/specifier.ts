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
