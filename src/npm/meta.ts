import { fetch_mutable } from "../storage/mutable.ts";
import type { Opt } from "../options.ts";
import { NPMMeta } from "./meta.schema.ts";
// import { db } from "../storage/db.ts";

const cache = new Map<string, NPMMeta>();

let once = true;

export async function getNPMMeta(o: Opt, id: string) {
    if (cache.has(id)) {
        return cache.get(id)!;
    } else {
        const data = await fetch_mutable(o, new URL(`https://registry.npmjs.com/${id}`));
        if (cache.has(id)) {
            return cache.get(id)!;
        } else {
            if (!data) {
                throw new Error(`failed to fetch npm meta for ${id}`);
            }
            const meta = NPMMeta.safeParse(JSON.parse(data ?? ""));
            if (meta.success) {
                cache.set(id, meta.data);
                return meta.data;
            } else {
                if (once) {
                    once = false;
                    console.log(meta.error);
                }
                throw new Error(`invalid NPM meta for ${id}`);
            }
        }
    }
}

// export async function getNPMVersionMeta(o: Opt, id: string, version: string | null) {
//     const rec = db.sql`SELECT `
// }
