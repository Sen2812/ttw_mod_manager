/**
 * Pack Collision Detector
 *
 * Detects conflicts between mod pack files:
 * - File-level collisions (same file in multiple packs)
 * - Table-level collisions (same table row in multiple packs)
 */

import { Pack, PackFileCollision, PackTableCollision } from "../types";

/**
 * Check if adding a new pack creates file collisions with existing packs.
 * Returns new collision entries.
 */
export function detectFileCollisions(
  existingPacks: Pack[],
  newPack: Pack,
): PackFileCollision[] {
  const collisions: PackFileCollision[] = [];
  const newFileNames = new Set(newPack.packedFiles.map((f) => f.name));

  for (const existingPack of existingPacks) {
    if (existingPack.path === newPack.path) continue;

    for (const packedFile of existingPack.packedFiles) {
      if (newFileNames.has(packedFile.name)) {
        const newFile = newPack.packedFiles.find((f) => f.name === packedFile.name);
        collisions.push({
          firstPackName: existingPack.name,
          secondPackName: newPack.name,
          fileName: packedFile.name,
          areSameSize: newFile ? packedFile.file_size === newFile.file_size : undefined,
        });
      }
    }
  }

  return collisions;
}

/**
 * Check if adding a new pack creates table row collisions.
 * Only checks files that start with "db\" (database tables).
 */
export function detectTableCollisions(
  existingPacks: Pack[],
  newPack: Pack,
): PackTableCollision[] {
  const collisions: PackTableCollision[] = [];

  const newDBFiles = newPack.packedFiles.filter((f) => f.name.startsWith("db\\"));
  const newFileNames = new Set(newDBFiles.map((f) => f.name));

  for (const existingPack of existingPacks) {
    if (existingPack.path === newPack.path) continue;

    for (const existingFile of existingPack.packedFiles) {
      if (!newFileNames.has(existingFile.name)) continue;
      if (!existingFile.name.startsWith("db\\")) continue;

      const newFile = newDBFiles.find((f) => f.name === existingFile.name);
      if (!newFile?.schemaFields || !existingFile.schemaFields) continue;

      // Check for key field collisions
      const keyFields = existingFile.schemaFields.filter((f) => f.isKey);
      for (const keyField of keyFields) {
        const newKeyField = newFile.schemaFields.find(
          (f) => f.isKey && f.fields?.[0]?.val === keyField.fields?.[0]?.val,
        );
        if (newKeyField) {
          collisions.push({
            firstPackName: existingPack.name,
            secondPackName: newPack.name,
            fileName: existingFile.name,
            secondFileName: newFile.name,
            key: keyField.fields?.[0]?.val?.toString() ?? "",
            value: keyField.fields?.[1]?.val?.toString() ?? "",
          });
        }
      }
    }
  }

  return collisions;
}

/**
 * Get the list of vanilla pack files that are overwritten by mod packs.
 */
export function findOverwrittenVanillaFiles(
  modPacks: Pack[],
  vanillaPacks: Pack[],
): Record<string, string[]> {
  const overwritten: Record<string, string[]> = {};
  const matchDBFiles = /^db\\.*\\data__/;

  for (const modPack of modPacks) {
    const modFileNames = modPack.packedFiles
      .map((f) => f.name)
      .filter((name) => matchDBFiles.test(name) || name.endsWith(".lua"));

    const overwrittenFiles = modFileNames.filter((fileName) =>
      vanillaPacks.some((vp) => vp.packedFiles.some((vf) => vf.name === fileName)),
    );

    if (overwrittenFiles.length > 0) {
      overwritten[modPack.name] = overwrittenFiles;
    }
  }

  return overwritten;
}
