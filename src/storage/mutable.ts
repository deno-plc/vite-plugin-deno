import type { Opt } from "../options.ts";
import { set_blob } from "./blobfs.ts";
import { db } from "./db.ts";

const instanceCache = new Map<string, string>();
const requestCache = new Map<string, Promise<string | null>>();

export async function fetch_mutable(o: Opt, url: URL) {
    // console.log(`fetch mutable`, url);
    if (instanceCache.has(url.href)) {
        return instanceCache.get(url.href)!;
    } else if (requestCache.has(url.href)) {
        return await requestCache.get(url.href)!;
    } else {
        const pr = new Promise<string | null>((res) => {
            (async () => {
                if (o.force_online) {
                    return (await fetch_online(url)) || fetch_offline(url);
                } else {
                    return fetch_offline(url) || (await fetch_online(url));
                }
            })().then(res);
        });
        requestCache.set(url.href, pr);
        return await pr;
    }
}

function fetch_offline(url: URL) {
    const hit = db.sql`SELECT data
            FROM blobs, mutable_url
            WHERE sha512 = blob_ref AND url = ${url.href}`;

    if (hit[0]) {
        const content = new TextDecoder().decode(hit[0].data);
        instanceCache.set(url.href, content);
        return content;
    } else {
        return null;
    }
}

async function fetch_online(url: URL) {
    const res = await fetch(url, {
        headers: {
            "Accept": "application/typescript, text/javascript, application/json, text/plain, application/octet-stream",
        },
    });
    if (res.ok) {
        const content = new Uint8Array(await res.arrayBuffer());
        db.sql`INSERT OR IGNORE INTO mutable_url(url,blob_ref) VALUES (${url.href}, ${
            (await set_blob(content)).digest.sha512
        })`;
        const text = new TextDecoder().decode(content);
        instanceCache.set(url.href, text);
        return text;
    } else {
        return null;
    }
}
