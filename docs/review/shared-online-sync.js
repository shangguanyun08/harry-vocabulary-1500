(function installMarcoOnlineSync(global) {
  "use strict";

  const API_URL = "https://marco-round1-missed-mastery.alexsoton.chatgpt.site/api/shared/progress";
  const POLL_MS = 2000;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function fingerprint(value) {
    const text = JSON.stringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${text.length}-${(hash >>> 0).toString(16)}`;
  }

  function readMeta(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function writeMeta(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Online sync still works for the current tab when storage is restricted.
    }
  }

  function deviceId(appId) {
    const key = `${appId}:online-device-v1`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) return saved;
      const created = global.crypto?.randomUUID?.() ||
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, created);
      return created;
    } catch {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }
  }

  async function request(appId, method = "GET", body) {
    const url = `${API_URL}?appId=${encodeURIComponent(appId)}`;
    const response = await fetch(url, {
      method,
      cache: "no-store",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Online progress is unavailable.");
    return data;
  }

  function create(options) {
    if (!options?.appId || typeof options.onRemote !== "function") {
      throw new Error("Online sync needs an appId and onRemote callback.");
    }

    const appId = options.appId;
    const metaKey = `${appId}:online-sync-v1`;
    const device = deviceId(appId);
    let meta = readMeta(metaKey);
    let version = Number.isInteger(meta.version) ? meta.version : null;
    let currentState = null;
    let currentFingerprint = "";
    let pending = null;
    let inFlight = false;
    let booted = false;
    let pollTimer = null;
    let badge = null;
    let lastBadge = ["connecting", "Connecting online…"];

    function ensureBadge() {
      if (badge?.isConnected) return badge;
      badge = document.querySelector(`[data-online-sync="${appId}"]`);
      if (badge) return badge;
      if (!document.body) return null;
      badge = document.createElement("div");
      badge.dataset.onlineSync = appId;
      badge.setAttribute("role", "status");
      badge.setAttribute("aria-live", "polite");
      badge.style.cssText = [
        "position:fixed",
        "right:max(12px,env(safe-area-inset-right))",
        "bottom:max(12px,env(safe-area-inset-bottom))",
        "z-index:2147483647",
        "display:flex",
        "align-items:center",
        "gap:7px",
        "max-width:calc(100vw - 24px)",
        "padding:8px 11px",
        "border:1px solid rgba(255,255,255,.2)",
        "border-radius:999px",
        "background:rgba(10,9,45,.92)",
        "box-shadow:0 8px 24px rgba(0,0,0,.2)",
        "color:#fff",
        "font:600 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        "backdrop-filter:blur(10px)",
      ].join(";");
      document.body.append(badge);
      return badge;
    }

    function setStatus(kind, message) {
      lastBadge = [kind, message];
      const node = ensureBadge();
      if (!node) return;
      const colors = { connecting: "#fbbf24", saving: "#60a5fa", live: "#34d399", offline: "#fb7185" };
      node.innerHTML = `<span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:${colors[kind] || colors.connecting};box-shadow:0 0 0 3px rgba(255,255,255,.1)"></span><span>${message}</span>`;
    }

    if (!document.body) {
      document.addEventListener("DOMContentLoaded", () => setStatus(...lastBadge), { once: true });
    }

    function validState(value) {
      return !options.validate || options.validate(value);
    }

    function score(value) {
      try {
        const result = Number(options.score?.(value) || 0);
        return Number.isFinite(result) ? Math.max(0, Math.floor(result)) : 0;
      } catch {
        return 0;
      }
    }

    function remember(record, stateFingerprint) {
      version = record.version;
      meta = {
        version,
        fingerprint: stateFingerprint,
        updatedAt: record.updatedAt,
      };
      writeMeta(metaKey, meta);
    }

    function applyRemote(record) {
      if (!record || !validState(record.state)) return false;
      const next = clone(record.state);
      const nextFingerprint = fingerprint(next);
      currentState = next;
      currentFingerprint = nextFingerprint;
      remember(record, nextFingerprint);
      try {
        options.onRemote(next, record);
      } catch (error) {
        console.error("Could not display online progress.", error);
      }
      return true;
    }

    async function drain() {
      if (!booted || inFlight || !pending) return;
      inFlight = true;
      let retryItem = null;
      try {
        while (pending) {
          const item = pending;
          pending = null;
          retryItem = item;
          setStatus("saving", "Saving online…");
          const data = await request(appId, "POST", {
            appId,
            studentName: options.studentName || "Student",
            deviceId: device,
            state: item.state,
            progressScore: score(item.state),
            baseVersion: item.migration ? null : version,
            clientUpdatedAt: item.clientUpdatedAt,
          });
          const record = data.progress;
          if (!record) throw new Error("The online save returned no progress.");

          if (data.accepted) {
            remember(record, item.fingerprint);
          } else if (pending) {
            version = record.version;
          } else {
            applyRemote(record);
          }
          retryItem = null;
        }
        setStatus("live", "Live · saved online");
      } catch (error) {
        if (!pending && retryItem) pending = retryItem;
        console.warn("Online progress will retry.", error);
        setStatus("offline", "Offline · saved on this device");
      } finally {
        inFlight = false;
      }
    }

    function queue(state, migration = false) {
      if (!validState(state)) return;
      const snapshot = clone(state);
      currentState = snapshot;
      currentFingerprint = fingerprint(snapshot);
      pending = {
        state: snapshot,
        fingerprint: currentFingerprint,
        migration,
        clientUpdatedAt: new Date().toISOString(),
      };
      if (booted) void drain();
    }

    async function poll() {
      if (!booted) return;
      if (pending) {
        await drain();
        return;
      }
      if (inFlight) return;
      try {
        const data = await request(appId);
        const record = data.progress;
        if (!record) {
          queue(currentState);
          return;
        }
        if (record.version !== version) {
          if (currentFingerprint === meta.fingerprint) applyRemote(record);
          else queue(currentState);
        }
        setStatus("live", "Live · saved online");
      } catch (error) {
        console.warn("Online progress polling will retry.", error);
        setStatus("offline", "Offline · saved on this device");
      }
    }

    async function start(initialState) {
      if (!validState(initialState)) return;
      currentState = clone(initialState);
      currentFingerprint = fingerprint(currentState);
      setStatus("connecting", "Connecting online…");
      try {
        const data = await request(appId);
        const record = data.progress;
        booted = true;
        if (pending) {
          if (record) version = record.version;
        } else if (!record) {
          queue(currentState, true);
        } else if (version === null) {
          queue(currentState, true);
        } else if (currentFingerprint !== meta.fingerprint) {
          queue(currentState);
        } else {
          applyRemote(record);
        }
        await drain();
      } catch (error) {
        booted = true;
        if (!pending) queue(currentState, version === null);
        console.warn("Online progress will retry.", error);
        setStatus("offline", "Offline · saved on this device");
      }
      global.clearInterval(pollTimer);
      pollTimer = global.setInterval(poll, POLL_MS);
    }

    global.addEventListener("online", () => void poll());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void poll();
    });

    return {
      start,
      push(state) {
        queue(state, !booted && version === null);
      },
      refresh: poll,
      stop() {
        global.clearInterval(pollTimer);
      },
    };
  }

  global.MarcoOnlineSync = { create };
})(window);

