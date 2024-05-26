import { z } from "zod";
// @deno-types=npm:@types/semver
import { valid, validRange } from "npm:semver";

export type RecordOrString = string | { [Key: string]: RecordOrString };

export const RecordOrString: z.ZodType<RecordOrString> = z.union([
    z.string(),
    z.record(z.string(), z.lazy(() => RecordOrString)),
]);

const zSemver = z.custom<string>((data) => {
    if (data === "canary" || data === "alpha" || data === "beta") {
        return true;
    }
    if (valid(String(data))) {
        return true;
    }
    console.log(`invalid semver ${data}`);
    return false;
});
const zSemverRange = z.custom<string>((data) => {
    if (data === "canary" || data === "alpha" || data === "beta") {
        return true;
    }
    if (valid(String(data))) {
        return true;
    }
    if (validRange(String(data))) {
        return true;
    }
    console.log(`invalid semver ${data}`);
    return false;
});

export const NPMMeta = z.object({
    name: z.string(),
    "dist-tags": z.object({
        latest: zSemver,
    }),
    versions: z.record(
        zSemver,
        z.object({
            dependencies: z.record(z.string(), zSemverRange).optional(),
            peerDependencies: z.record(z.string(), zSemverRange).optional(),
            exports: z.record(z.string(), RecordOrString).optional(),
            main: z.string().default("index.js"),
            dist: z.object({
                tarball: z.string(),
                integrity: z.string(),
            }),
        }),
    ),
});

export type NPMMeta = z.infer<typeof NPMMeta>;
