import { encodeHex } from "@std/encoding/hex";

export async function buffer_digest(data: Uint8Array): Promise<string> {
    return encodeHex(await crypto.subtle.digest("SHA-256", data));
}
