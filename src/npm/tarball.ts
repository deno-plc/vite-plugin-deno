import { assert } from "@std/assert";
import type { Opt } from "../options.ts";
import { fetch_immutable } from "../storage/immutable.ts";
import { getNPMMeta } from "./meta.ts";
// @deno-types="npm:@types/tar-stream"
import { extract } from "npm:tar-stream";
// @deno-types="npm:@types/node"
import { createGunzip } from "node:zlib";
// @deno-types="npm:@types/node"
import { Buffer } from "node:buffer";
import { set_blob } from "../storage/blobfs.ts";
import { db } from "../storage/db.ts";

const loading = new Map<string, Promise<void>>();

export async function ensureTarball(o: Opt, packageName: string, version: string) {
    const id = `${packageName}@${version}`;

    if (loading.has(id)) {
        await loading.get(id)!;
    } else {
        if (db.sql`SELECT 1 FROM npm_tar WHERE package = ${packageName} AND version = ${version} LIMIT 1`.length) {
            return;
        }

        const pr = loadTarball(o, packageName, version);
        loading.set(id, pr);
        pr.then(() => {
            loading.delete(id);
        });
        await pr;
    }
}

async function loadTarball(o: Opt, packageName: string, version: string) {
    const meta = await getNPMMeta(o, packageName);
    const versionMeta = meta.versions[version];
    if (!versionMeta) {
        throw new Error(`could not load version meta for ${packageName}@${version}`);
    }
    const url = new URL(versionMeta?.dist?.tarball);
    const tgz = await fetch_immutable({
        url,
        lockfileID: `npm:${packageName}@${version}~tarball`,
    });

    assert(tgz);

    const tar = extract();

    tar.on("entry", (header, stream, cb) => {
        const path = header.name.substring("package/".length);
        // console.log(header.name);
        const data: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => {
            data.push(chunk);
        });

        stream.on("end", async () => {
            const content = new Uint8Array(Buffer.concat(data).buffer);
            const entry = await set_blob(content);
            db.sql`INSERT OR IGNORE INTO npm_tar(package,version,file,blob_ref) VALUES (${packageName}, ${version}, ${path}, ${entry.digest.sha512})`;
            cb();
        });

        stream.resume();
    });

    const gz = createGunzip();

    gz.pipe(tar);

    gz.write(tgz);

    await new Promise<void>((res) => {
        tar.on("finish", () => {
            res();
        });
    });
}
