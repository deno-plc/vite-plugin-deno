export function decodeJSONBuffer(buffer: Uint8Array): unknown {
    return JSON.parse(new TextDecoder().decode(buffer));
}

export function encodeJSONBuffer(json: unknown): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(json));
}
