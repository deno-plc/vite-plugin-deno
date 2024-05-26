import { fetch_immutable } from "./storage/immutable.ts";

export async function load_remote(id: string): Promise<Uint8Array | null> {
    return await fetch_immutable({
        url: new URL(id.substring("remote:".length)),
        lockfileID: id,
    });
}
