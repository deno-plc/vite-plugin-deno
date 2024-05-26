import { assertEquals } from "@std/assert";
import { parseNPM } from "./npm/specifier.ts";

Deno.test("parse NPM spec", () => {
    assertEquals(parseNPM("foo"), {
        name: "foo",
        version: null,
        path: "",
    });

    assertEquals(parseNPM("foo@1.0.0"), {
        name: "foo",
        version: "1.0.0",
        path: "",
    });

    assertEquals(parseNPM("@foo/bar"), {
        name: "@foo/bar",
        version: null,
        path: "",
    });

    assertEquals(parseNPM("@foo/bar@1.0.0"), {
        name: "@foo/bar",
        version: "1.0.0",
        path: "",
    });

    assertEquals(parseNPM("foo/file"), {
        name: "foo",
        version: null,
        path: "file",
    });

    assertEquals(parseNPM("foo@1.0.0/file"), {
        name: "foo",
        version: "1.0.0",
        path: "file",
    });

    assertEquals(parseNPM("@foo/bar/file"), {
        name: "@foo/bar",
        version: null,
        path: "file",
    });

    assertEquals(parseNPM("@foo/bar@1.0.0/file"), {
        name: "@foo/bar",
        version: "1.0.0",
        path: "file",
    });

    assertEquals(parseNPM("@foo/bar@1.0.0/path/file"), {
        name: "@foo/bar",
        version: "1.0.0",
        path: "path/file",
    });
});
