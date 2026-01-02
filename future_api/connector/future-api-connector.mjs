#!/usr/bin/env node
import { SynchroClient } from "./synchro-api.js";

const CFG = {
  host: process.env.FUTUREBOT_HOST ?? "127.0.0.1",
  port: Number(process.env.FUTUREBOT_PORT ?? "11088"),
  scope: process.env.API_SCOPE ?? "FUTURE_API",
  timeoutMs: Number(process.env.API_TIMEOUT_MS ?? "8000"),

  // Comma-separated locations to READ, e.g.:
  // ROUTES="__probe,system/name,system/stats/total_users"
  routes:
    (process.env.ROUTES ??
      "__probe,ping,system/name,system/stats,system/stats/total_users,system/node_list,system/username?user_number=1,user/1/alias,__schema/system")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
};

const ts = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

function pretty(x) {
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function send(obj) {
    const line = JSON.stringify(obj);
    sock.write(line + "\r\n", "utf8");
    log("OUT:", line);
  }

  function subscribe(location, scope) {
    send(
      makePacket({
        scope: scope,
        func: "QUERY",
        oper: "SUBSCRIBE",
        location,
        nick: CFG.nick,
        system: CFG.systemName,
        timeout: -1,
      })
    );
  }

  function write(location, data, scope) {
    send(
      makePacket({
        scope: scope,
        func: "QUERY",
        oper: "WRITE",
        location,
        data,
        lock: 2,
        timeout: -1,
      })
    );
  }

  function push(location, dat, scope) {
    send(
      makePacket({
        scope: scope,
        func: "QUERY",
        oper: "PUSH",
        location,
        data,
        lock: 2,
        timeout: -1,
      })
    );
  }

  function read(location, scope) {
    send(
      makePacket({
        scope: scope,
        func: "QUERY",
        oper: "READ",
        location,
        lock: 1,
        timeout: -1,
      })
    );
  }

async function main() {
  log(`Connecting to ${CFG.host}:${CFG.port} scope=${CFG.scope}`);

  const c = new SynchroClient({
    host: CFG.host,
    port: CFG.port,
    scope: CFG.scope,
    nick: "api_test",
    system: "test_client",
    timeoutMs: CFG.timeoutMs,
    // Quiet mode - no packet logging
  });

  await c.connect();
  log("Connected.\n");
  
  // Test ping
  const pong = await c.read("ping");
  log("ping:", pong?.ok ? "OK" : "FAIL");

  // Test all configured routes
  for (const loc of CFG.routes) {
    try {
      const data = await c.read(loc);
      const preview = typeof data === "object" 
        ? JSON.stringify(data).slice(0, 120) + (JSON.stringify(data).length > 120 ? "..." : "")
        : String(data);
      log(`${loc}: ${preview}`);
    } catch (e) {
      log(`${loc}: ERROR - ${e.message}`);
    }
  }

  // Test method with params
  try {
    const username = await c.request({
      oper: "READ",
      location: "system/username",
      data: { user_number: 1 }
    });
    log(`system/username(1): ${username}`);
  } catch (e) {
    log(`system/username(1): ERROR - ${e.message}`);
  }

  // Test KEYS
  try {
    const keys = await c.request({ oper: "KEYS", location: "system" });
    log(`system KEYS: ${keys?.properties?.length || 0} props, ${keys?.methods?.length || 0} methods, ${keys?.children?.length || 0} children`);
  } catch (e) {
    log(`system KEYS: ERROR - ${e.message}`);
  }

  await c.close();
  log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});