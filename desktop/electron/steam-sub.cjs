/**
 * Child process: query workshop item dependencies via steamworks (GetQueryUGCChildren).
 * argv: [appId, "getDependencies", "id1,id2,..."]
 */
const path = require("path");
const steamworks = require(path.join(__dirname, "..", "steamworks", "index.js"));

function parseItemIds(raw) {
  return (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "" && /^\d+$/.test(id))
    .map((id) => BigInt(id));
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
}
