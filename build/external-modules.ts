// Modules that contain or depend on native binaries (.node files) and cannot
// be bundled by Vite. These are marked as external in vite.main.config.ts and
// must be shipped in node_modules by forge.config.ts during packaging.
export const externalModules = [
  '@boxlite-ai/agentlite',
  '@boxlite-ai/boxlite',
  '@onecli-sh/sdk',
  'better-sqlite3',
];

function normalizeImportId(importId: string) {
  return importId
    .replace(/\\/g, '/')
    .replace(/[?#].*$/, '');
}

export function isExternalModuleId(
  importId: string,
  rootModuleIds: readonly string[] = externalModules,
) {
  const normalizedImportId = normalizeImportId(importId);

  return rootModuleIds.some((moduleId) => {
    const nodeModulesPackagePath = `/node_modules/${moduleId}`;

    return normalizedImportId === moduleId
      || normalizedImportId.startsWith(`${moduleId}/`)
      || normalizedImportId.endsWith(nodeModulesPackagePath)
      || normalizedImportId.includes(`${nodeModulesPackagePath}/`);
  });
}
