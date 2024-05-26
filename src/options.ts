import type { ImportMap } from "../mod.ts";

export interface Opt {
    force_online: boolean;
    cdn_imports: string[];
    importMap: ImportMap;
    importMapPath: string;
    nodePolyfills: Map<string, string>;
    undeclared_dependencies: string[];
}
