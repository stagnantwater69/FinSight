// Starts the local dev stack: API and receipt worker (through backend/scripts/dev-database.ts),
// waits for /api/v1/health/live, then starts one client.
// The client gets the terminal so its key shortcuts work; API and worker output is tagged [api] and [worker].
//
//   node scripts/dev.mjs [web|mobile|api]    default web; api starts the backend only
//
// It never runs migrations and never reads or writes any .env file; it only checks that backend/.env exists.
// Ctrl-C, or the exit of any child, stops every child this script started.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

export const USAGE = "Usage: node scripts/dev.mjs [web|mobile|api]  (default web; api starts only the API and the worker)";
const MODES = ["web", "mobile", "api"];
const LIVE_TIMEOUT_MS = 120_000;

export function parseArgs(argv) {
  if (argv.length > 1) return { error: `Expected one mode, got: ${argv.join(" ")}. ${USAGE}` };
  const [arg = "web"] = argv;
  if (arg === "--help" || arg === "-h") return { help: true };
  if (!MODES.includes(arg)) return { error: `Unknown mode "${arg}". ${USAGE}` };
  return { mode: arg };
}

export function apiPort(env) {
  const port = Number(env.PORT ?? 4000);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined;
}

export function commands(root, mode) {
  const backend = path.join(root, "backend");
  const tsx = path.join(backend, "node_modules", "tsx", "dist", "cli.mjs");
  const piped = ["ignore", "pipe", "pipe"];
  const list = [
    { tag: "api", project: "backend", cwd: backend, args: [tsx, "scripts/dev-database.ts", "api"], stdio: piped },
    { tag: "worker", project: "backend", cwd: backend, args: [tsx, "scripts/dev-database.ts", "worker"], stdio: piped },
  ];
  // Expo and Vite turn their key menus off unless stdin/stdout is a TTY.
  if (mode === "web") {
    const web = path.join(root, "web");
    list.push({ tag: "web", project: "web", cwd: web, args: [path.join(web, "node_modules", "vite", "bin", "vite.js")], stdio: "inherit" });
  }
  if (mode === "mobile") {
    const mobile = path.join(root, "mobile");
    list.push({ tag: "mobile", project: "mobile", cwd: mobile, args: [path.join(mobile, "node_modules", "expo", "bin", "cli"), "start"], stdio: "inherit" });
  }
  return list;
}

// Returns one line per problem; an empty list means the stack can start.
export function checkPrerequisites(root, mode, nodeVersion = process.versions.node) {
  const problems = [];
  const major = Number(nodeVersion.split(".")[0]);
  if (major !== 22) problems.push(`Node 22 is required; this is Node ${nodeVersion}. Switch with fnm or nvm and run again.`);
  const cmds = commands(root, mode);
  for (const project of new Set(cmds.map((c) => c.project))) {
    if (!existsSync(path.join(root, project, "node_modules"))) {
      problems.push(`${project}/node_modules is missing. Run npm ci in ${project}/.`);
      continue;
    }
    for (const c of cmds.filter((c) => c.project === project && !existsSync(c.args[0]))) {
      problems.push(`${path.relative(root, c.args[0])} is missing. Run npm ci in ${project}/.`);
    }
  }
  if (!existsSync(path.join(root, "backend", ".env"))) {
    problems.push("backend/.env is missing. Copy backend/.env.example and fill in the values (see docs/TEAM-ONBOARDING-SECRETS.md).");
  }
  return problems;
}

export function portInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

async function status(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return res.status;
  } catch {
    return undefined;
  }
}

function prefix(stream, tag, out) {
  readline.createInterface({ input: stream }).on("line", (line) => out.write(`[${tag}] ${line}\n`));
}

// stopChildren(code) runs once, for whichever of SIGINT or a child exit comes first.
// Ctrl-C can reach the children before this script's own SIGINT, so a failing exit waits graceMs for it.
export function createStopper(stopChildren, graceMs = 500) {
  const state = {
    stopping: false,
    stop(code) {
      if (state.stopping) return;
      state.stopping = true;
      stopChildren(code);
    },
    childExited({ tag, stdio }, code, signal) {
      if (state.stopping) return;
      if (stdio === "inherit" && code === 0) {
        console.log(`[dev] ${tag} stopped; stopping the rest.`);
        return state.stop(0);
      }
      setTimeout(() => {
        if (state.stopping) return;
        console.error(`[dev] ${tag} exited (${signal ?? `code ${code}`}); stopping the rest.`);
        state.stop(code || 1);
      }, graceMs);
    },
  };
  return state;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) return console.log(USAGE);
  if (parsed.error) { console.error(parsed.error); process.exitCode = 1; return; }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const problems = checkPrerequisites(root, parsed.mode);
  const port = apiPort(process.env);
  if (port === undefined) problems.push(`PORT="${process.env.PORT}" is not a valid port number.`);
  else if (await portInUse(port)) problems.push(`Port ${port} is already in use. Stop whatever holds it (an API you already started?) or set PORT.`);
  if (problems.length) { for (const p of problems) console.error(`[dev] ${p}`); process.exitCode = 1; return; }

  const children = new Set();
  const stopper = createStopper((code) => {
    process.exitCode = code;
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      // /T takes the tsx watch and server grandchildren too; only PIDs this script spawned are targeted.
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else child.kill("SIGTERM");
    }
  });
  const stopAll = stopper.stop;
  const start = (cmd) => {
    const { tag, cwd, args, stdio } = cmd;
    const child = spawn(process.execPath, args, { cwd, env: process.env, stdio, windowsHide: true });
    children.add(child);
    if (child.stdout) prefix(child.stdout, tag, process.stdout);
    if (child.stderr) prefix(child.stderr, tag, process.stderr);
    child.once("error", (err) => { console.error(`[dev] ${tag} could not start: ${err.message}`); stopAll(1); });
    child.once("exit", (code, signal) => stopper.childExited(cmd, code, signal));
    return child;
  };
  process.on("SIGINT", () => { if (!stopper.stopping) console.log("[dev] Stopping."); stopAll(0); });
  process.on("SIGTERM", () => stopAll(0));

  const [api, worker, client] = commands(root, parsed.mode);
  start(api);
  start(worker);

  const base = `http://127.0.0.1:${port}/api/v1`;
  const deadline = Date.now() + LIVE_TIMEOUT_MS;
  while ((await status(`${base}/health/live`)) !== 200) {
    if (stopper.stopping) return;
    if (Date.now() > deadline) {
      console.error(`[dev] ${base}/health/live did not answer 200 within ${LIVE_TIMEOUT_MS / 1000}s; stopping.`);
      return stopAll(1);
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  console.log(`[dev] API live at ${base}/health/live`);
  const ready = await status(`${base}/health/ready`);
  console.log(`[dev] /health/ready returned ${ready ?? "no response"}${ready === 200 ? "" : " (the API is up but a dependency is not ready)"}`);
  console.log("[dev] Worker is running. Locally that is the only check: its heartbeat file is written only inside the container.");

  if (stopper.stopping) return;
  if (client) start(client);
  console.log(`[dev] ${client ? `${client.tag} starting. ` : ""}Press Ctrl-C to stop everything this script started.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
