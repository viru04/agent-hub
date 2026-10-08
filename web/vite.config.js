import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: webRoot,
  base: "./",
  plugins: [
    react(),
    {
      name: "agenthub-dev-registry",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = new URL(request.url, "http://vite.local").pathname;
          const registryFiles = {
            "/index.json": path.resolve(webRoot, "../dist/index.json"),
            "/config.json": path.resolve(webRoot, "../dist/config.json"),
          };
          const registryFile = registryFiles[pathname];
          if (!registryFile) return next();
          if (!fs.existsSync(registryFile)) {
            response.statusCode = 503;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            return response.end(JSON.stringify({ error: "Registry is not built. Run npm run build first." }));
          }
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          fs.createReadStream(registryFile).pipe(response);
        });
      },
    },
  ],
  build: {
    outDir: path.resolve(webRoot, "../dist"),
    emptyOutDir: false,
  },
});
