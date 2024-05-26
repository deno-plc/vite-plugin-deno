import { decodeBase64, encodeBase64 } from "@std/encoding/base64";
import { double_from_digest, double_from_sha256, double_from_sha512, get_blob } from "./blobfs.ts";
import { decodeBase58, encodeBase58 } from "@std/encoding/base58";

const digestTable = new Map<string, DoubleDigest>();

/**
 * holds the two equivalent sha256 and sha512 digests
 *
 * Singleton, can be compared directly
 */
export class DoubleDigest {
    private constructor(
        readonly sha256: Uint8Array,
        readonly sha512: Uint8Array,
        readonly sha256s: string,
        readonly sha512s: string,
    ) {
    }
    public get_blob(): Uint8Array | null {
        return get_blob(this)?.data ?? null;
    }
    public to_sha512_base58() {
        return encodeBase58(this.sha512);
    }
    public to_sha256_base58() {
        return encodeBase58(this.sha256);
    }
    public to_sha512_base64() {
        return this.sha512s;
    }
    public to_sha256_base64() {
        return this.sha256s;
    }
    static from(sha256: Uint8Array, sha512: Uint8Array): DoubleDigest {
        if (sha256.length !== 32) {
            throw new TypeError(`invalid sha256 digest`);
        }
        if (sha512.length !== 64) {
            throw new TypeError(`invalid sha512 digest`);
        }
        const sha256s = encodeBase64(sha256);
        if (digestTable.has(sha256s)) {
            return digestTable.get(sha256s)!;
        }
        const sha512s = encodeBase64(sha512);
        if (digestTable.has(sha512s)) {
            return digestTable.get(sha512s)!;
        }

        const digest = new DoubleDigest(sha256, sha512, sha256s, sha512s);
        digestTable.set(sha256s, digest);
        digestTable.set(sha512s, digest);
        return digest;
    }
    static from_sha256(sha256: Uint8Array) {
        if (sha256.length !== 32) {
            throw new TypeError(`invalid sha256 digest`);
        }
        const sha256s = encodeBase64(sha256);
        if (digestTable.has(sha256s)) {
            return digestTable.get(sha256s);
        }
        return double_from_sha256(sha256);
    }
    static from_sha512(sha512: Uint8Array) {
        if (sha512.length !== 64) {
            throw new TypeError(`invalid sha512 digest`);
        }
        const sha512s = encodeBase64(sha512);
        if (digestTable.has(sha512s)) {
            return digestTable.get(sha512s)!;
        }
        return double_from_sha512(sha512);
    }
    static from_digest(digest: Uint8Array) {
        if (digest.length !== 32 && digest.length !== 64) {
            throw new TypeError(`invalid sha256 or sha512 digest`);
        }
        const base64 = encodeBase64(digest);
        if (digestTable.has(base64)) {
            return digestTable.get(base64);
        }
        return double_from_digest(digest);
    }
    static from_base64(base64: string) {
        if (digestTable.has(base64)) {
            return digestTable.get(base64);
        }
        const digest = decodeBase64(base64);
        if (digest.length !== 32 && digest.length !== 64) {
            throw new TypeError(`invalid sha256 or sha512 digest`);
        }
        return double_from_digest(digest);
    }
    static from_base58(base58: string) {
        return this.from_digest(decodeBase58(base58));
    }
}
