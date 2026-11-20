import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { apiPort, checkPrerequisites, commands, createStopper, parseArgs, portInUse } from "./dev.mjs";

const scratch = mkdtempSync(path.join(os.tmpdir(), "finsight-dev-selftest-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

function touch(root, relative) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "");
}

function fullRoot(name) {
  const root = path.join(scratch, name);
  for (const c of [...commands(root, "web"), ...commands(root, "mobile")]) touch(root, path.relative(root, c.args[0]));
  touch(root, "backend/.env");
  return root;
}

test("parseArgs defaults to web and rejects unknown or extra arguments", () => {
  assert.deepEqual(parseArgs([]), { mode: "web" });
  for (const mode of ["web", "mobile", "api"]) assert.deepEqual(parseArgs([mode]), { mode });
  assert.deepEqual(parseArgs(["--help"]), { help: true });
  assert.deepEqual(parseArgs(["-h"]), { help: true });
  assert.match(parseArgs(["ios"]).error, /Unknown mode "ios"/);
  assert.match(parseArgs(["web", "api"]).error, /Expected one mode/);
});

test("apiPort uses PORT or 4000 and rejects junk", () => {
  assert.equal(apiPort({}), 4000);
  assert.equal(apiPort({ PORT: "4100" }), 4100);
  assert.equal(apiPort({ PORT: "abc" }), undefined);
  assert.equal(apiPort({ PORT: "70000" }), undefined);
});

test("commands start the API and worker through dev-database.ts, then one client, all under node", () => {
  const root = path.join(scratch, "cmds");
  const tags = (mode) => commands(root, mode).map((c) => c.tag);
  assert.deepEqual(tags("api"), ["api", "worker"]);
  assert.deepEqual(tags("web"), ["api", "worker", "web"]);
  assert.deepEqual(tags("mobile"), ["api", "worker", "mobile"]);

  const [api, worker, web] = commands(root, "web");
  assert.deepEqual(api.args.slice(1), ["scripts/dev-database.ts", "api"]);
  assert.deepEqual(worker.args.slice(1), ["scripts/dev-database.ts", "worker"]);
  assert.equal(api.args[0], path.join(root, "backend/node_modules/tsx/dist/cli.mjs"));
  assert.equal(api.cwd, path.join(root, "backend"));
  assert.equal(web.args[0], path.join(root, "web/node_modules/vite/bin/vite.js"));
  const mobile = commands(root, "mobile")[2];
  assert.deepEqual(mobile.args, [path.join(root, "mobile/node_modules/expo/bin/cli"), "start"]);
  const all = [...commands(root, "web"), mobile].flatMap((c) => c.args).join(" ");
  assert.doesNotMatch(all, /migrate|\.cmd\b|npx|npm/);
});

test("only the client gets the terminal; the API and worker stay piped and tagged", () => {
  const root = path.join(scratch, "stdio");
  for (const mode of ["web", "mobile"]) {
    const [api, worker, client] = commands(root, mode);
    assert.deepEqual(api.stdio, ["ignore", "pipe", "pipe"]);
    assert.deepEqual(worker.stdio, ["ignore", "pipe", "pipe"]);
    assert.equal(client.stdio, "inherit");
  }
});

const api = { tag: "api", stdio: ["ignore", "pipe", "pipe"] };
const client = { tag: "web", stdio: "inherit" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function stopperWithLog() {
  const calls = [];
  return { calls, stopper: createStopper((code) => calls.push(code), 20) };
}

test("Ctrl-C stops once with 0 whether SIGINT or the client's own exit comes first", async () => {
  for (const order of [["sigint", "client"], ["client", "sigint"], ["sigint", "api"], ["api", "sigint"]]) {
    const { calls, stopper } = stopperWithLog();
    for (const event of order) {
      if (event === "sigint") stopper.stop(0);
      else if (event === "client") stopper.childExited(client, 0, null);
      else stopper.childExited(api, 3221225786, null);
    }
    await wait(50);
    assert.deepEqual(calls, [0], order.join(" then "));
  }
});

test("a crash or a non-zero client exit still stops the rest with a non-zero code", async () => {
  for (const [cmd, code, signal, expected] of [[api, 1, null, 1], [api, 0, null, 1], [api, null, "SIGKILL", 1], [client, 2, null, 2]]) {
    const { calls, stopper } = stopperWithLog();
    stopper.childExited(cmd, code, signal);
    assert.deepEqual(calls, [], "waits for a possible SIGINT first");
    await wait(50);
    assert.deepEqual(calls, [expected]);
  }
});

test("checkPrerequisites passes on a complete tree under Node 22", () => {
  const root = fullRoot("complete");
  for (const mode of ["web", "mobile", "api"]) assert.deepEqual(checkPrerequisites(root, mode, "22.23.3"), []);
});

test("checkPrerequisites reports the wrong Node major", () => {
  const [problem, ...rest] = checkPrerequisites(fullRoot("node"), "api", "25.1.0");
  assert.match(problem, /Node 22 is required; this is Node 25\.1\.0/);
  assert.deepEqual(rest, []);
});

test("checkPrerequisites only requires node_modules for the projects the mode starts", () => {
  const root = fullRoot("partial");
  rmSync(path.join(root, "mobile/node_modules"), { recursive: true });
  assert.deepEqual(checkPrerequisites(root, "web", "22.0.0"), []);
  assert.deepEqual(checkPrerequisites(root, "mobile", "22.0.0"), ["mobile/node_modules is missing. Run npm ci in mobile/."]);
  rmSync(path.join(root, "web/node_modules/vite"), { recursive: true });
  assert.match(checkPrerequisites(root, "web", "22.0.0")[0], /vite\.js is missing\. Run npm ci in web\//);
});

test("checkPrerequisites reports a missing backend/.env", () => {
  const root = fullRoot("noenv");
  rmSync(path.join(root, "backend/.env"));
  const problems = checkPrerequisites(root, "api", "22.0.0");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^backend\/\.env is missing/);
});

test("portInUse sees a listening port and a free one", async () => {
  const server = net.createServer().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address();
  assert.equal(await portInUse(port), true);
  await new Promise((r) => server.close(r));
  assert.equal(await portInUse(port), false);
});
