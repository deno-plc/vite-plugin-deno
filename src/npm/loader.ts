import type { Opt } from "../options.ts";
import { db } from "../storage/db.ts";
import type { NPM } from "./specifier.ts";
import { ensureTarball } from "./tarball.ts";

export async function loadNPMFile(o: Opt, p: NPM) {
    await ensureTarball(o, p.name, p.version!);

    const file = p.path;

    const rec =
        db.sql`SELECT data FROM blobs, npm_tar WHERE sha512 = blob_ref AND package = ${p.name} AND version = ${p.version} AND (file = ${file} OR file = ${
            file + ".js"
        } OR file = ${file + ".cjs"} OR file = ${file + ".mjs"})`[0];
    if (rec) {
        return new Uint8Array(rec.data);
    } else {
        throw new Error(`could not load '${p.name}@${p.version}/${p.path}', file does not exist`);
    }
}
