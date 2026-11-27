const { spawn } = require("node:child_process");

const port = 7111;
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["-r", "./search-type-filter.js", "index.js"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let logs = "";
child.stdout.on("data", chunk => { logs += chunk.toString(); });
child.stderr.on("data", chunk => { logs += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Addon exited early (code ${child.exitCode}):\n${logs}`);
    }
    try {
      const response = await fetch(`${baseUrl}/manifest.json`);
      if (response.ok) return response;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Addon did not start within 15 seconds:\n${logs}`);
}

async function checkManifest(url, expectedCatalogs) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.id !== "org.kkphim.stremio") {
    throw new Error(`Unexpected manifest id: ${manifest.id}`);
  }
  for (const id of expectedCatalogs) {
    if (!manifest.catalogs.some(catalog => catalog.id === id)) {
      throw new Error(`Missing catalog ${id} in ${url}`);
    }
  }
}

(async () => {
  try {
    await waitForServer();
    await checkManifest(`${baseUrl}/manifest.json`, ["kkphim-movie", "kkphim-series"]);

    const configured = await fetch(`${baseUrl}/config/movie,series/manifest.json`);
    if (!configured.ok) {
      throw new Error(`Configured manifest returned HTTP ${configured.status}`);
    }
    const configuredManifest = await configured.json();
    if (configuredManifest.catalogs.length !== 2) {
      throw new Error(`Expected 2 configured catalogs, got ${configuredManifest.catalogs.length}`);
    }

    const configurePage = await fetch(`${baseUrl}/configure`);
    if (!configurePage.ok || !(await configurePage.text()).includes("Cấu hình KKPhim")) {
      throw new Error("Configure page did not render correctly");
    }

    console.log("Smoke test passed: server startup, base manifest, configured manifest, configure page.");
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
  }
})();
