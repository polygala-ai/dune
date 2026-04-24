// Shared IPC request/response shapes.

/** Project descriptor surfaced through main-process project IPC. */
export interface ProjectDescriptor {
  activeItemCount: number;
  archivedAt: number | null;
  description: string;
  id: string;
  name: string;
  sortOrder: number;
}

/** Project-scoped settings. */
export interface ProjectSettings {
  defaultAgentId: string | null;
  telegramGroupId: string | null;
}

/** Project settings patch shape. */
export type ProjectSettingsPatch = Partial<ProjectSettings>;
