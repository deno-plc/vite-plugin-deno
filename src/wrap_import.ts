// export type ImportResolver = (importPath: string) => string | undefined;

// export function wrap_imports(src: string, resolvers: ImportResolver[]) {
//     function process_input(importPath: string, offset: number) {
//         let start = offset;
//         const fromPos = src.slice(offset).search(/(?<=from ?").+(?=")/);
//         const importPos = src.slice(offset).search(/(?<=import ?").+(?=")/);
//         if (fromPos !== -1) {
//             start += fromPos;
//         } else if (importPos !== -1) {
//             start += importPos;
//         } else {
//             return src;
//         }
//         const end = src.indexOf(`"`, start + 1);
//         if (end === -1) {
//             console.warn(`malformed`);
//             return src;
//         }

//         console.log(`import path: ${importPath}`);
//         let replacer: string | undefined = undefined;
//         for (const resolver of resolvers) {
//             replacer = resolver(importPath);
//             if (replacer) {
//                 break;
//             }
//         }
//         console.log(`replace: ${replacer}`);
//         if (replacer) {
//             src = src.replaceAll(`"${importPath}"`, `"${replacer}"`);
//         }
//     }
//     for (const match of src.matchAll(/(?<=from ?").+(?=")/g) || []) {
//         process_input(match[0], 0);
//     }
//     for (const match of src.matchAll(/(?<=import ?").+(?=")/g) || []) {
//         process_input(match[0], 0);
//     }
//     return src;
// }

// export const wrap_remote_https: ImportResolver = (importPath) => {
//     if (importPath.startsWith("https://")) {
//         return `remote:${importPath}`;
//     }
// };
