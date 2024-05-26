import type { z } from "zod";
import { NPMMeta } from "./meta.schema.ts";

function assertValid<S extends z.ZodType>(schema: S, data: unknown | z.infer<S>) {
    const p = schema.safeParse(data);
    if (p.success) {
        // fine
    } else {
        throw p.error;
    }
}

function _assertInvalid<S extends z.ZodType>(schema: S, data: unknown) {
    const p = schema.safeParse(data);
    if (p.success) {
        throw new Error(`incorrectly accepted\n${JSON.stringify(data, null, 4)}`);
    } else {
        // fine
    }
}

Deno.test("NPM Meta", () => {
    assertValid(NPMMeta, {
        name: "foo",
        "dist-tags": {
            latest: "1.2.3",
        },
        versions: {
            "1.2.3": {
                dependencies: {
                    bar: "^1.0.0",
                },
                peerDependencies: {
                    fizz: "^1.0.0",
                },
                main: "src/index.js",
                dist: {
                    tarball: "tarball",
                    integrity: "123456",
                },
                exports: {
                    ".": {
                        node: {
                            "umd": "dist/index.node.umd.js",
                        },
                    },
                    "./foo": {
                        "esm": "dist/foo.mjs",
                    },
                    "./bar": "dist/bar.js",
                },
            },
        },
    });
});
