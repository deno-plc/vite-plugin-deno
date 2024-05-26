import { dirname, join, resolve } from "@std/path";
import type { Opt } from "./options.ts";
import { resolveImport } from "./resolve.ts";

export async function resolveWithImportMap(o: Opt, id: string, importer?: string) {
    const trs = await tryImportMap(o, id, "");
    if (trs) {
        return trs;
    }

    let offset = 0;
    while (offset = id.indexOf("/", offset + 1), offset !== -1) {
        const trs = await tryImportMap(o, id.substring(0, offset), id.substring(offset));
        if (trs) {
            return trs;
        }
    }

    return await resolveImport(o, id, importer);
}

async function tryImportMap(o: Opt, mapped: string, remaining: string): Promise<string | null> {
    const importMapRef = o.importMap.lookup(mapped);
    if (importMapRef) {
        if (importMapRef.startsWith("./")) {
            // console.log(`${join(dirname(resolve(o.importMapPath)), importMapRef).replaceAll("\\", "/")}${remaining}`);
            return `${join(dirname(resolve(o.importMapPath)), importMapRef).replaceAll("\\", "/")}${remaining}`;
        }
        const wrapped = await resolveImport(o, `${importMapRef}${remaining}`);
        if (wrapped) {
            return wrapped;
        } else {
            return `${importMapRef}${remaining}`;
        }
    }
    return null;
}
