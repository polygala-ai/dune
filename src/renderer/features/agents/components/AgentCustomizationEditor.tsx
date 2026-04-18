// Agent customization editor UI.

import {
  type ReactNode,
  useMemo,
  useState,
} from 'react';
import {
  FileText,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import {
  createAgentMcpEnvVarDraft,
  createAgentMcpServerDraft,
  createAgentSkillDraft,
  getAgentSkillDraftLabel,
  getDuplicateMcpServerIds,
  type AgentCustomizationDraft,
  type AgentMcpServerDraft,
} from '@/renderer/features/agents/model/agent-customization';
import type { AgentArchetype } from '@/renderer/features/agents/types';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';
import { Separator } from '@/renderer/shared/ui/separator';
import { Textarea } from '@/renderer/shared/ui/textarea';

/** Agent customization editor props. */
interface AgentCustomizationEditorProps {
  agentArchetype?: AgentArchetype;
  artifactsPath?: string | undefined;
  className?: string;
  value: AgentCustomizationDraft;
  onChange: (value: AgentCustomizationDraft) => void;
}

/** Section props. */
interface SectionProps {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}

/** Renders the section UI. */
function Section({
  children,
  description,
  eyebrow,
  title,
}: SectionProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <div className="surface-eyebrow">{eyebrow}</div>
        <div>
          <h3 className="text-[1rem] font-semibold tracking-[-0.03em] text-app-text">
            {title}
          </h3>
          <p className="mt-1 text-sm leading-6 text-app-muted">{description}</p>
        </div>
      </div>
      <div className="rounded-[22px] border border-app-border bg-app-panel/38 px-4 py-4 sm:px-5">
        {children}
      </div>
    </section>
  );
}

/** Renders the field label UI. */
function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
}

/** Renders the field error UI. */
function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-5 text-red-600 dark:text-red-300">
      {children}
    </p>
  );
}

/** Renders the empty shell UI. */
function EmptyShell({
  title,
  body,
}: {
  body: string;
  title: string;
}) {
  return (
    <div className="rounded-[16px] border border-dashed border-app-border bg-app-card/35 px-4 py-3">
      <p className="text-sm font-medium text-app-text">{title}</p>
      <p className="mt-1 text-sm leading-6 text-app-muted">{body}</p>
    </div>
  );
}

/** Returns server name error. */
function getServerNameError(
  server: AgentMcpServerDraft,
  duplicateIds: Set<string>,
) {
  if (!server.name.trim()) {
    return 'Server name is required.';
  }

  if (duplicateIds.has(server.id)) {
    return 'Server names must be unique.';
  }

  return null;
}

/** Returns source error. */
function getSourceError(server: AgentMcpServerDraft) {
  if (!server.source.trim()) {
    return 'Source folder is required.';
  }

  return null;
}

/** Returns command error. */
function getCommandError(server: AgentMcpServerDraft) {
  if (!server.command.trim()) {
    return 'Command is required.';
  }

  return null;
}

/** Returns instructions template filename. */
function getInstructionsTemplateFilename(archetype: AgentArchetype) {
  return archetype === 'project-main'
    ? 'dune-main-agent-instructions.md'
    : 'dune-agent-instructions.md';
}

/** Joins path. */
function joinPath(basePath: string, filename: string) {
  if (basePath.endsWith('/') || basePath.endsWith('\\')) {
    return `${basePath}${filename}`;
  }

  return `${basePath}${basePath.includes('\\') ? '\\' : '/'}${filename}`;
}

/** Renders the agent customization editor UI. */
export function AgentCustomizationEditor({
  agentArchetype = 'custom',
  artifactsPath,
  className,
  value,
  onChange,
}: AgentCustomizationEditorProps) {
  const [skillSearch, setSkillSearch] = useState('');
  const duplicateServerIds = useMemo(
    () => getDuplicateMcpServerIds(value.mcpServers),
    [value.mcpServers],
  );
  const selectedSkills = value.skills.filter((skill) => skill.name.trim() || skill.path.trim());
  const instructionsTemplateFilename = getInstructionsTemplateFilename(agentArchetype);
  const instructionsTemplatePath = artifactsPath
    ? joinPath(artifactsPath, instructionsTemplateFilename)
    : null;
  const canOpenInstructionsTemplate = Boolean(
    instructionsTemplatePath && typeof window.duneDesktop?.openPath === 'function',
  );

  /** Updates value. */
  const updateValue = (nextValue: AgentCustomizationDraft) => {
    onChange(nextValue);
  };

  /** Updates skill. */
  const updateSkill = (
    skillId: string,
    updater: (skill: AgentCustomizationDraft['skills'][number]) => AgentCustomizationDraft['skills'][number],
  ) => {
    updateValue({
      ...value,
      skills: value.skills.map((skill) => skill.id === skillId ? updater(skill) : skill),
    });
  };

  const removeSkill = (skillId: string) => {
    updateValue({
      ...value,
      skills: value.skills.filter((skill) => skill.id !== skillId),
    });
  };

  /** Updates server. */
  const updateServer = (
    serverId: string,
    updater: (server: AgentCustomizationDraft['mcpServers'][number]) => AgentCustomizationDraft['mcpServers'][number],
  ) => {
    updateValue({
      ...value,
      mcpServers: value.mcpServers.map((server) => server.id === serverId ? updater(server) : server),
    });
  };

  const removeServer = (serverId: string) => {
    updateValue({
      ...value,
      mcpServers: value.mcpServers.filter((server) => server.id !== serverId),
    });
  };

  /** Opens instructions template. */
  const openInstructionsTemplate = () => {
    if (!instructionsTemplatePath) {
      return;
    }

    void window.duneDesktop?.openPath?.(instructionsTemplatePath);
  };

  return (
    <div className={className}>
      <div className="space-y-6">
        <Section
          description="Add guidance that layers on top of the inherited agent template. This stays local to the renderer in this pass."
          eyebrow="Instructions"
          title="Additional instructions"
        >
          <div className="space-y-4">
            <div className="rounded-[16px] border border-app-border bg-app-card/35 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                    Inherited template
                  </div>
                  <p className="mt-1 text-sm leading-6 text-app-muted">
                    Open the original instructions file that this draft layers on top of.
                  </p>
                  {instructionsTemplatePath ? (
                    <code className="mt-2 block break-all text-xs text-app-muted/70">
                      {instructionsTemplatePath}
                    </code>
                  ) : (
                    <p className="mt-2 text-xs leading-5 text-app-muted">
                      The original template path is unavailable in this runtime.
                    </p>
                  )}
                </div>
                <Button
                  className="shrink-0"
                  disabled={!canOpenInstructionsTemplate}
                  onClick={openInstructionsTemplate}
                  type="button"
                  variant="outline"
                >
                  <FileText className="h-4 w-4" />
                  Open original file
                </Button>
              </div>
            </div>

            <div className="space-y-2">
            <FieldLabel htmlFor="agent-customization-instructions">
              Additive instructions
            </FieldLabel>
            <Textarea
              id="agent-customization-instructions"
              onChange={(event) => updateValue({
                ...value,
                additionalInstructions: event.target.value,
              })}
              placeholder="Be explicit about tradeoffs, keep release notes terse, and flag blockers early."
              rows={6}
              value={value.additionalInstructions}
            />
            </div>
          </div>
        </Section>

        <Section
          description="Search is scaffolded for the future skill catalog. For now, attach local skill folders manually and review them as selected pills below."
          eyebrow="Skills"
          title="Local skills"
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <FieldLabel htmlFor="agent-customization-skill-search">
                Search installed skills
              </FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
                <Input
                  className="pl-10"
                  id="agent-customization-skill-search"
                  onChange={(event) => setSkillSearch(event.target.value)}
                  placeholder="Search the future catalog"
                  value={skillSearch}
                />
              </div>
            </div>

            <EmptyShell
              body={
                skillSearch.trim()
                  ? `Nothing matches "${skillSearch}" yet because skill discovery is not wired in this pass.`
                  : 'Discovered project and global skills will appear here in the next pass.'
              }
              title="Catalog shell"
            />

            {selectedSkills.length > 0 ? (
              <div className="space-y-2">
                <FieldLabel>Selected skills</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {selectedSkills.map((skill) => (
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-app-border bg-app-panel/70 px-3 py-1.5 text-xs text-app-muted transition-colors hover:border-app-border-strong hover:bg-app-card"
                      key={skill.id}
                      onClick={() => removeSkill(skill.id)}
                      type="button"
                    >
                      <span>{getAgentSkillDraftLabel(skill)}</span>
                      <span className="text-app-muted/70">· {skill.origin}</span>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {value.skills.length === 0 ? (
                <EmptyShell
                  body="No skill folders attached yet. Add a local folder to preview how this flow should feel."
                  title="No local skill folders"
                />
              ) : (
                value.skills.map((skill) => (
                  <div
                    className="rounded-[18px] border border-app-border bg-white/20 p-4"
                    key={skill.id}
                  >
                    <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
                      <div className="space-y-2">
                        <FieldLabel htmlFor={`skill-name-${skill.id}`}>Skill name</FieldLabel>
                        <Input
                          id={`skill-name-${skill.id}`}
                          onChange={(event) => updateSkill(skill.id, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))}
                          placeholder="Release notes"
                          value={skill.name}
                        />
                      </div>
                      <div className="space-y-2">
                        <FieldLabel htmlFor={`skill-path-${skill.id}`}>Folder path</FieldLabel>
                        <Input
                          id={`skill-path-${skill.id}`}
                          onChange={(event) => updateSkill(skill.id, (current) => ({
                            ...current,
                            path: event.target.value,
                          }))}
                          placeholder="/Users/you/.codex/skills/release-notes"
                          value={skill.path}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          onClick={() => removeSkill(skill.id)}
                          type="button"
                          variant="quiet"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-app-muted">
                      <span className="inline-flex items-center rounded-full border border-app-border bg-app-panel/65 px-2.5 py-1 font-mono text-[11px] text-app-muted">
                        {skill.origin}
                      </span>
                      <span>Local folder draft only. Discovery and validation ship later.</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <Button
              onClick={() => updateValue({
                ...value,
                skills: [...value.skills, createAgentSkillDraft()],
              })}
              type="button"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              Add folder
            </Button>
          </div>
        </Section>

        <Section
          description="Define stdio MCP server drafts with client-side validation only. These stay in renderer memory and do not touch the runtime yet."
          eyebrow="MCP"
          title="Agent-local MCP servers"
        >
          <div className="space-y-5">
            {value.mcpServers.length === 0 ? (
              <EmptyShell
                body="No MCP servers attached yet. Add one to preview the local editor and validation states."
                title="No MCP servers"
              />
            ) : (
              value.mcpServers.map((server) => {
                const nameError = getServerNameError(server, duplicateServerIds);
                const sourceError = getSourceError(server);
                const commandError = getCommandError(server);

                return (
                  <div
                    className="rounded-[18px] border border-app-border bg-white/20 p-4"
                    key={server.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-app-text">
                          {server.name.trim() || 'Untitled MCP server'}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-app-muted">
                          Draft-only stdio configuration. Runtime wiring lands next.
                        </p>
                      </div>
                      <Button
                        onClick={() => removeServer(server.id)}
                        size="sm"
                        type="button"
                        variant="quiet"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <FieldLabel htmlFor={`mcp-name-${server.id}`}>Server name</FieldLabel>
                        <Input
                          id={`mcp-name-${server.id}`}
                          onChange={(event) => updateServer(server.id, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))}
                          placeholder="repo_tools"
                          value={server.name}
                        />
                        {nameError ? <FieldError>{nameError}</FieldError> : null}
                      </div>

                      <div className="space-y-2">
                        <FieldLabel htmlFor={`mcp-source-${server.id}`}>Source folder</FieldLabel>
                        <Input
                          id={`mcp-source-${server.id}`}
                          onChange={(event) => updateServer(server.id, (current) => ({
                            ...current,
                            source: event.target.value,
                          }))}
                          placeholder="/Users/you/dev/repo-tools"
                          value={server.source}
                        />
                        {sourceError ? <FieldError>{sourceError}</FieldError> : null}
                      </div>

                      <div className="space-y-2">
                        <FieldLabel htmlFor={`mcp-command-${server.id}`}>Command</FieldLabel>
                        <Input
                          id={`mcp-command-${server.id}`}
                          onChange={(event) => updateServer(server.id, (current) => ({
                            ...current,
                            command: event.target.value,
                          }))}
                          placeholder="node"
                          value={server.command}
                        />
                        {commandError ? <FieldError>{commandError}</FieldError> : null}
                      </div>

                      <div className="space-y-2">
                        <FieldLabel htmlFor={`mcp-args-${server.id}`}>Args</FieldLabel>
                        <Input
                          id={`mcp-args-${server.id}`}
                          onChange={(event) => updateServer(server.id, (current) => ({
                            ...current,
                            args: event.target.value,
                          }))}
                          placeholder="dist/index.js --verbose"
                          value={server.args}
                        />
                      </div>
                    </div>

                    <Separator className="my-5" />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                            Environment
                          </div>
                          <p className="mt-1 text-sm leading-6 text-app-muted">
                            Add key/value pairs for this server draft.
                          </p>
                        </div>
                        <Button
                          onClick={() => updateServer(server.id, (current) => ({
                            ...current,
                            env: [...current.env, createAgentMcpEnvVarDraft()],
                          }))}
                          size="sm"
                          type="button"
                          variant="quiet"
                        >
                          <Plus className="h-4 w-4" />
                          Add env var
                        </Button>
                      </div>

                      {server.env.length === 0 ? (
                        <EmptyShell
                          body="No environment variables added yet."
                          title="Empty environment"
                        />
                      ) : (
                        <div className="space-y-3">
                          {server.env.map((entry) => (
                            <div
                              className="grid gap-3 rounded-[14px] border border-app-border/80 bg-app-panel/45 px-3 py-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]"
                              key={entry.id}
                            >
                              <div className="space-y-2">
                                <FieldLabel htmlFor={`mcp-env-key-${entry.id}`}>Key</FieldLabel>
                                <Input
                                  id={`mcp-env-key-${entry.id}`}
                                  onChange={(event) => updateServer(server.id, (current) => ({
                                    ...current,
                                    env: current.env.map((currentEntry) => currentEntry.id === entry.id
                                      ? {
                                          ...currentEntry,
                                          key: event.target.value,
                                        }
                                      : currentEntry),
                                  }))}
                                  placeholder="API_TOKEN"
                                  value={entry.key}
                                />
                              </div>
                              <div className="space-y-2">
                                <FieldLabel htmlFor={`mcp-env-value-${entry.id}`}>Value</FieldLabel>
                                <Input
                                  id={`mcp-env-value-${entry.id}`}
                                  onChange={(event) => updateServer(server.id, (current) => ({
                                    ...current,
                                    env: current.env.map((currentEntry) => currentEntry.id === entry.id
                                      ? {
                                          ...currentEntry,
                                          value: event.target.value,
                                        }
                                      : currentEntry),
                                  }))}
                                  placeholder="secret-value"
                                  value={entry.value}
                                />
                              </div>
                              <div className="flex items-end">
                                <Button
                                  onClick={() => updateServer(server.id, (current) => ({
                                    ...current,
                                    env: current.env.filter((currentEntry) => currentEntry.id !== entry.id),
                                  }))}
                                  size="sm"
                                  type="button"
                                  variant="quiet"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            <Button
              onClick={() => updateValue({
                ...value,
                mcpServers: [...value.mcpServers, createAgentMcpServerDraft()],
              })}
              type="button"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              Add MCP server
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
