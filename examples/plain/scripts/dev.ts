import { createServer } from "vite";
import { config } from "./vite.ts";

const server = await createServer(config);
await server.listen();
server.printUrls();
