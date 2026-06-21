/**
 * Child process: Steamworks workshop queries (dependencies, subscribe, download).
 * argv: [appId, command, extraArg?]
 */
const fs = require("fs");
const path = require("path");
const steamworks = require(path.join(__dirname, "..", "steamworks", "index.js"));

const ITEM_SUBSCRIBED = 1;
const ITEM_INSTALLED = 4;
const ITEM_NEEDS_UPDATE = 8;
const ITEM_DOWNLOADING = 16;
const ITEM_DOWNLOAD_PENDING = 32;

function parseItemIds(raw) {
  return (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "" && /^\d+$/.test(id))
    .map((id) => BigInt(id));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function folderHasValidPack(folder) {
  if (!folder || !fs.existsSync(folder)) return false;
  try {
    return fs.readdirSync(folder).some((name) => {
      if (!name.endsWith(".pack")) return false;
      try {
        return fs.statSync(path.join(folder, name)).size >= 32;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function folderMissingOrEmpty(folder) {
  return !folderHasValidPack(folder);
}

function getDependencies(client, ids, cb) {
  const dependenciesMap = new Map();

  const promises = ids.map(
    (id) =>
      new Promise((resolve) => {
        client.workshop
          .getItemDependencies(id)
          .then((dependencyIds) => {
            dependenciesMap.set(
              id.toString(),
              dependencyIds.map((depId) => depId.toString()),
            );
            resolve();
          })
          .catch(() => {
            dependenciesMap.set(id.toString(), []);
            resolve();
          });
      }),
  );

  Promise.allSettled(promises).then(() => {
    cb(dependenciesMap);
  });
}

function readItemStatus(client, id) {
  const dl = client.workshop.downloadInfo(id);
  const install = client.workshop.installInfo(id);
  const installFolder = install?.folder ?? "";
  return {
    state: client.workshop.state(id),
    downloadCurrent: Number(dl?.current ?? 0),
    downloadTotal: Number(dl?.total ?? 0),
    installFolder,
    folderMissing: folderMissingOrEmpty(installFolder),
  };
}

/** True only when Steam is actively downloading bytes or has queued the item. */
function isActivelyDownloading(status) {
  const { state, downloadCurrent, downloadTotal } = status;
  if (state & ITEM_DOWNLOADING || state & ITEM_DOWNLOAD_PENDING) return true;
  if (downloadTotal > 0 && downloadCurrent < downloadTotal) return true;
  return false;
}

async function resubscribeAndDownload(client, id, before, mode) {
  try {
    if (before.state & ITEM_SUBSCRIBED) {
      await client.workshop.unsubscribe(id);
      await sleep(800);
    }
    await client.workshop.subscribe(id);
    await sleep(2000);
    let triggered = client.workshop.download(id, true);
    if (!triggered) triggered = client.workshop.download(id, false);
    await sleep(1500);
    const after = readItemStatus(client, id);
    const started = triggered
      || isActivelyDownloading(after)
      || after.downloadTotal > 0;
    return { triggered: started, mode, ...after };
  } catch (e) {
    return { triggered: false, mode: `${mode}_failed`, error: String(e), ...before };
  }
}

/**
 * Trigger workshop download via ISteamUGC#DownloadItem.
 * When Steam still marks an item installed but local files are gone (common after
 * a bad force-update delete), unsubscribe + resubscribe to queue a real download.
 */
async function triggerWorkshopDownload(client, id) {
  const before = readItemStatus(client, id);
  const installedButMissing = (before.state & ITEM_INSTALLED) && before.folderMissing;
  const notSubscribed = !(before.state & ITEM_SUBSCRIBED);

  if (isActivelyDownloading(before) && !installedButMissing) {
    return { triggered: true, mode: "in_progress", ...before };
  }

  if (installedButMissing || notSubscribed) {
    return resubscribeAndDownload(
      client,
      id,
      before,
      installedButMissing ? "installed_missing_resubscribe" : "resubscribed",
    );
  }

  if (before.state & ITEM_NEEDS_UPDATE) {
    let triggered = client.workshop.download(id, true);
    if (triggered) {
      await sleep(1500);
      const after = readItemStatus(client, id);
      if (isActivelyDownloading(after) || after.downloadTotal > 0) {
        return { triggered: true, mode: "needs_update_high", ...after };
      }
    }
    await sleep(800);
    triggered = client.workshop.download(id, false);
    if (triggered) {
      await sleep(1500);
      const after = readItemStatus(client, id);
      return { triggered: true, mode: "needs_update", ...after };
    }
  }

  let triggered = client.workshop.download(id, true);
  if (triggered) {
    await sleep(1500);
    const after = readItemStatus(client, id);
    if (isActivelyDownloading(after) || after.downloadTotal > 0) {
      return { triggered: true, mode: "download", ...after };
    }
  }

  triggered = client.workshop.download(id, false);
  if (triggered) {
    await sleep(1500);
    const after = readItemStatus(client, id);
    if (isActivelyDownloading(after) || after.downloadTotal > 0) {
      return { triggered: true, mode: "download_low", ...after };
    }
  }

  return { triggered: false, mode: "download_rejected", ...readItemStatus(client, id) };
}

const command = process.argv[3];
if (command === "getDependencies") {
  const appId = Number(process.argv[2]);
  const ids = parseItemIds(process.argv[4]);
  let client;
  try {
    client = steamworks.init(appId);
  } catch (e) {
    if (process.send) process.send({ __error: String(e) });
    process.exit(1);
  }

  getDependencies(client, ids, (dependenciesMap) => {
    if (process.send) {
      process.send(Object.fromEntries(dependenciesMap));
    }
    setTimeout(() => process.exit(0), 200);
  });
} else if (command === "getSubscribed") {
  const appId = Number(process.argv[2]);
  let client;
  try {
    client = steamworks.init(appId);
  } catch (e) {
    if (process.send) process.send({ __error: String(e) });
    process.exit(1);
  }

  try {
    const ids = client.workshop.getSubscribedItems().map((id) => id.toString());
    if (process.send) process.send({ ids });
  } catch (e) {
    if (process.send) process.send({ __error: String(e) });
  }
  setTimeout(() => process.exit(0), 200);
} else if (command === "downloadItems") {
  const appId = Number(process.argv[2]);
  const ids = parseItemIds(process.argv[4]);
  let client;
  try {
    client = steamworks.init(appId);
  } catch (e) {
    if (process.send) process.send({ __error: String(e) });
    process.exit(1);
  }

  void (async () => {
    const results = {};
    for (const id of ids) {
      try {
        results[id.toString()] = await triggerWorkshopDownload(client, id);
      } catch (e) {
        results[id.toString()] = { triggered: false, mode: "error", error: String(e) };
      }
    }
    if (process.send) process.send({ results });
    setTimeout(() => process.exit(0), 500);
  })();
} else if (command === "getItemStatus") {
  const appId = Number(process.argv[2]);
  const ids = parseItemIds(process.argv[4]);
  let client;
  try {
    client = steamworks.init(appId);
  } catch (e) {
    if (process.send) process.send({ __error: String(e) });
    process.exit(1);
  }

  const results = {};
  for (const id of ids) {
    try {
      results[id.toString()] = readItemStatus(client, id);
    } catch (e) {
      results[id.toString()] = {
        state: 0,
        downloadCurrent: 0,
        downloadTotal: 0,
        installFolder: "",
        folderMissing: true,
        error: String(e),
      };
    }
  }
  if (process.send) process.send({ results });
  setTimeout(() => process.exit(0), 200);
} else if (command === "ping") {
  const appId = Number(process.argv[2]);
  try {
    steamworks.init(appId);
    if (process.send) process.send({ ok: true });
  } catch (e) {
    if (process.send) process.send({ ok: false, error: String(e) });
  }
  setTimeout(() => process.exit(0), 200);
}
