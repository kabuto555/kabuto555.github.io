import { defineConfig, type Plugin } from 'vite';
import { resolve, join, sep, extname } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';

const usePolling = process.env.CONTAINER_MODE === 'true';

const ASSET_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

// Exported games ship this vite.config.ts verbatim (project-export.ts's
// ENSURE_FROM_TEMPLATE), and the README tells the user to run `bun run dev`
// and `bun run preview` against it. Without this plugin neither works: the
// build is a library build (publicDir: false, only dist/game.js + .map), so
// vite's own static server has nothing at `/` and doesn't know about the
// session-scoped `/game/game.js` path index.html requests. This plugin makes
// the exported project's OWN root index.html and dist/ output servable
// directly, standing in for the platform's per-session Bun handler that a
// standalone export never has. It also serves root-level `assets/**` itself,
// because `vite preview` only serves `outDir` (publicDir is off) and would
// otherwise 404 on every uploaded asset the README tells users to reference
// as a relative `assets/...` path. It cannot affect platform serving because
// the platform never runs `vite dev` or `vite preview` — see
// game-server-workspace.ts.
//
// This file is copied whole into every export with no sibling modules (see
// ENSURE_FROM_TEMPLATE), so the plugin has to be self-contained here rather
// than imported from a shared location — the same duplication exists in
// game-3d's vite.config.ts.
export function serveExportedGamePlugin(): Plugin {
  const root = resolve(__dirname);
  const distDir = join(root, 'dist');
  const assetsDir = join(root, 'assets');

  function respondMissingBuild(res: import('http').ServerResponse, fileName: string): void {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(
      `dist/${fileName} not found. Run \`bun run build\` first — both \`bun run dev\` ` +
        `and \`bun run preview\` only serve the output of the last \`bun run build\`.`,
    );
  }

  function tryServeAsset(
    pathname: string,
    res: import('http').ServerResponse,
    next: () => void,
  ): boolean {
    if (!pathname.startsWith('/assets/')) return false;

    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname.slice('/assets/'.length));
    } catch {
      next();
      return true;
    }
    const candidate = resolve(join(assetsDir, decoded));
    if (!candidate.startsWith(assetsDir + sep)) {
      next();
      return true;
    }

    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(candidate);
    } catch {
      next();
      return true;
    }
    if (!stat.isFile()) {
      next();
      return true;
    }

    res.statusCode = 200;
    res.setHeader(
      'Content-Type',
      ASSET_CONTENT_TYPES[extname(candidate).toLowerCase()] ?? 'application/octet-stream',
    );
    res.end(readFileSync(candidate));
    return true;
  }

  function handleRequest(
    req: import('http').IncomingMessage,
    res: import('http').ServerResponse,
    next: () => void,
  ): void {
    const pathname = (req.url ?? '/').split('?')[0];

    if (tryServeAsset(pathname, res, next)) {
      return;
    }

    if (pathname === '/' || pathname === '/index.html') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(readFileSync(join(root, 'index.html')));
      return;
    }

    if (pathname === '/game/game.js' || pathname === '/game/game.js.map') {
      const fileName = pathname.slice('/game/'.length);
      const filePath = join(distDir, fileName);
      if (!existsSync(filePath)) {
        respondMissingBuild(res, fileName);
        return;
      }
      res.statusCode = 200;
      res.setHeader(
        'Content-Type',
        fileName.endsWith('.map') ? 'application/json; charset=utf-8' : 'application/javascript; charset=utf-8',
      );
      res.end(readFileSync(filePath));
      return;
    }

    next();
  }

  return {
    name: 'serve-exported-game',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handleRequest(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        handleRequest(req, res, next);
      });
    },
  };
}

export default defineConfig({
  root: resolve(__dirname),
  publicDir: false,
  plugins: [serveExportedGamePlugin()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'Game',
      fileName: () => 'game.js',
      formats: ['iife'],
    },
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    watch: usePolling ? { chokidar: { usePolling: true, interval: 500 } } : undefined,
    rollupOptions: {
      external: ['phaser', 'three'],
      output: {
        globals: {
          phaser: 'Phaser',
          three: 'THREE',
        },
      },
    },
  },
});
