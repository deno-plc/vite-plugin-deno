import type { RecordOrString } from "./meta.schema.ts";

export function resolveNPMExport(exportEntry: RecordOrString | null): string | null {
    if (exportEntry === null || typeof exportEntry === "string") {
        return exportEntry;
    } else {
        return resolveNPMExport(
            exportEntry["import"] ||
                exportEntry["require"] ||
                exportEntry["browser"] ||
                exportEntry["default"] ||
                exportEntry["deno"] ||
                exportEntry["node"] ||
                null,
        );
    }
}
