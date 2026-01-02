// synchro-api.js
//
// Tiny client for Synchronet JSON services over TCP (newline-delimited JSON).
//
// -----------------------------
// Packet shapes (client -> server)
// -----------------------------
// Request packet (what YOU send):
// {
//   scope:    string,              // service name in services.ini, e.g. "FUTURE_API"
//   func:     "QUERY" | "PING",     // almost always "QUERY" for services
//   oper:     string,              // service-specific verb (commonly READ/WRITE/KEYS/PUSH/SUBSCRIBE)
//   location: string,              // path-like selector, e.g. "usage/summary/text"
//   data?:    any JSON-serializable,// only for ops that include payload (WRITE, PUSH, etc.)
//   lock?:    number,              // advisory/semantics vary (jsondb uses it; your API can ignore)
//   timeout?: number,              // ms, service may ignore; useful client-side
//   nick?:    string,              // optional identity metadata
//   system?:  string               // optional identity metadata
// }
//
// -----------------------------
// Packet shapes (server -> client)
// -----------------------------
// Response packet (what YOU receive):
// {
//   scope:    string,
//   func:     "RESPONSE" | "PING" | "ERROR",
//   oper:     string,              // typically mirrors request oper
//   location: string,              // typically mirrors request location
//   data?:    any JSON-serializable
// }
//
// Notes:
// - Transport is TCP. Each packet is one JSON object followed by "\r\n" (or "\n").
// - The server may also send PING or ERROR asynchronously.
// - For your custom FUTURE_API route-style service, the main pattern is:
//     request:  { func:"QUERY", oper:"READ", location:"usage/summary" }
//     response: { func:"RESPONSE", oper:"READ", location:"usage/summary", data: ... }
//
// -----------------------------
// Usage
// -----------------------------
// import { SynchroClient } from "./synchro-api.js";
// const c = new SynchroClient({ host, port, scope:"FUTURE_API" });
// await c.connect();
// const data = await c.read("usage/summary");
// await c.close();

import net from "node:net";

export class SynchroClient {
  constructor({
    host = "127.0.0.1",
    port = 11088,
    scope = "FUTURE_API",
    nick = "node_probe",
    system = "node",
    timeoutMs = 8000,
    // optional hooks for logging:
    onSend = null,
    onRecv = null,
    onNonJson = null,
  } = {}) {
    this.cfg = { host, port, scope, nick, system, timeoutMs };
    this.hooks = { onSend, onRecv, onNonJson };

    this.sock = null;
    this._buf = "";
    this._pending = []; // [{match, resolve, reject, t}]
  }

  // ---------- public ----------
  isConnected() {
    return this.sock !== null && !this.sock.destroyed;
  }

  async connect() {
    if (this.sock) return;

    this.sock = net.createConnection({ host: this.cfg.host, port: this.cfg.port });
    this.sock.setNoDelay(true);
    this.sock.setKeepAlive(true, 10_000);

    this.sock.on("data", (chunk) => this._onData(chunk));
    this.sock.on("error", (e) => this._failAll(e));
    this.sock.on("close", () => this._failAll(new Error("socket closed")));

    await new Promise((resolve, reject) => {
      const onErr = (e) => {
        cleanup();
        reject(e);
      };
      const onConn = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        this.sock.off("error", onErr);
        this.sock.off("connect", onConn);
      };
      this.sock.once("error", onErr);
      this.sock.once("connect", onConn);
    });
  }

  async close() {
    if (!this.sock) return;
    try {
      this.sock.end();
    } finally {
      this.sock = null;
    }
  }

  send(packet) {
    if (!this.sock) throw new Error("not connected");

    const line = JSON.stringify(packet);
    this.sock.write(line + "\r\n", "utf8");

    if (this.hooks.onSend) this.hooks.onSend(packet, line);
  }

  // Generic request that resolves when a matching RESPONSE arrives.
  request({ oper = "READ", location = "", data, lock = 1, timeoutMs } = {}) {
    const timeout = Number(timeoutMs ?? this.cfg.timeoutMs);

    const packet = {
      scope: this.cfg.scope,
      func: "QUERY",
      oper,
      location: String(location ?? ""),
      lock,
      timeout,
      nick: this.cfg.nick,
      system: this.cfg.system,
    };
    if (data !== undefined) packet.data = data;

    this.send(packet);

    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this._removePending(entry);
        reject(new Error(`timeout waiting for RESPONSE oper=${oper} location="${packet.location}"`));
      }, timeout);

      const entry = {
        match: (obj) =>
          String(obj?.func ?? "").toUpperCase() === "RESPONSE" &&
          String(obj?.oper ?? "").toUpperCase() === String(oper).toUpperCase() &&
          String(obj?.location ?? "") === String(packet.location ?? ""),
        resolve: (obj) => resolve(obj?.data),
        reject,
        t,
      };

      this._pending.push(entry);
    });
  }

  // Convenience helpers
  read(location, { lock = 1, timeoutMs } = {}) {
    return this.request({ oper: "READ", location, lock, timeoutMs });
  }
  keys(location = "", { lock = 1, timeoutMs } = {}) {
    return this.request({ oper: "KEYS", location, lock, timeoutMs });
  }
  write(location, data, { lock = 2, timeoutMs } = {}) {
    return this.request({ oper: "WRITE", location, data, lock, timeoutMs });
  }

  // ---------- internal ----------
  _onData(chunk) {
    this._buf += chunk.toString("utf8");
    const lines = this._buf.split(/\r?\n/);
    this._buf = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        if (this.hooks.onNonJson) this.hooks.onNonJson(line);
        continue;
      }

      if (this.hooks.onRecv) this.hooks.onRecv(obj, line);

      // Reply to server PINGs if they show up (harmless)
      if (String(obj?.func ?? "").toUpperCase() === "PING") {
        try {
          this.send({ scope: "SOCKET", func: "PONG", data: Date.now() });
        } catch {}
        continue;
      }

      // Resolve first pending that matches
      let matched = false;
      for (let i = 0; i < this._pending.length; i++) {
        const entry = this._pending[i];
        if (!entry) continue;
        if (entry.match(obj)) {
          matched = true;
          this._removePending(entry);
          entry.resolve(obj);
          break;
        }
      }

      // If no one was waiting, just let it be observed via onRecv hook
      // (this is useful for async UPDATE-style services like chat)
      void matched;
    }
  }

  _removePending(entry) {
    clearTimeout(entry.t);
    const idx = this._pending.indexOf(entry);
    if (idx >= 0) this._pending.splice(idx, 1);
  }

  _failAll(err) {
    const e = err instanceof Error ? err : new Error(String(err));
    for (const entry of this._pending.splice(0)) {
      try {
        clearTimeout(entry.t);
        entry.reject(e);
      } catch {}
    }
  }
}