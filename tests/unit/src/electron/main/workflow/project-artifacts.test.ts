// Project artifact helper tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ensureProjectRootClaudeMd,
  ensureProjectArtifactFolder,
  listProjectArtifactEntries,
  prepareProjectRootPath,
} from '@/electron/main/workflow/project-artifacts';

const tempDirs: string[] = [];

describe('project-artifacts', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();

      if (tempDir) {
        fs.rmSync(tempDir, { force: true, recursive: true });
      }
    }
  });

  it('prepares an empty project root and creates requested item folders', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-project-root-'));

    tempDirs.push(rootDir);

    const resolvedRootDir = prepareProjectRootPath(rootDir, ['homepage-copy-abcd1234']);

    expect(resolvedRootDir).toBe(path.resolve(rootDir));
    expect(fs.readFileSync(path.join(rootDir, 'CLAUDE.md'), 'utf-8')).toContain('/workspace/extra/project/');
    expect(fs.existsSync(path.join(rootDir, 'homepage-copy-abcd1234'))).toBe(true);
  });

  it('rejects non-empty project roots', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-project-root-'));

    tempDirs.push(rootDir);
    fs.writeFileSync(path.join(rootDir, 'notes.md'), '# already used\n');

    expect(() => prepareProjectRootPath(rootDir, [])).toThrow('Project folder must be empty.');
  });

  it('creates a single item artifact folder inside an existing project root', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-project-root-'));

    tempDirs.push(rootDir);

    const artifactPath = ensureProjectArtifactFolder(rootDir, 'landing-page-1234abcd');

    expect(fs.existsSync(path.join(rootDir, 'CLAUDE.md'))).toBe(true);
    expect(artifactPath).toBe(path.join(path.resolve(rootDir), 'landing-page-1234abcd'));
    expect(fs.existsSync(artifactPath)).toBe(true);
  });

  it('does not overwrite an existing project-root CLAUDE.md', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-project-root-'));
    const claudeMdPath = path.join(rootDir, 'CLAUDE.md');

    tempDirs.push(rootDir);
    fs.writeFileSync(claudeMdPath, '# User instructions\n');

    ensureProjectRootClaudeMd(rootDir);
    ensureProjectArtifactFolder(rootDir, 'landing-page-1234abcd');

    expect(fs.readFileSync(claudeMdPath, 'utf-8')).toBe('# User instructions\n');
  });

  it('allows retrying a project root that only contains CLAUDE.md', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-project-root-'));

    tempDirs.push(rootDir);
    ensureProjectRootClaudeMd(rootDir);

    expect(() => prepareProjectRootPath(rootDir, [])).not.toThrow();
  });

  it('allows a project root that only contains ignored OS metadata files', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-project-root-'));

    tempDirs.push(rootDir);
    fs.writeFileSync(path.join(rootDir, '.DS_Store'), 'metadata');

    expect(() => prepareProjectRootPath(rootDir, [])).not.toThrow();
  });

  it('lists artifact folder contents recursively by latest modified time', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dune-project-root-'));
    const artifactPath = ensureProjectArtifactFolder(rootDir, 'landing-page-1234abcd');
    const nestedDir = path.join(artifactPath, 'drafts');
    const olderFile = path.join(artifactPath, 'notes.md');
    const newerFile = path.join(nestedDir, 'brief.md');

    tempDirs.push(rootDir);
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(olderFile, '# notes\n');
    fs.writeFileSync(newerFile, '# brief\n');

    const olderDate = new Date('2026-01-01T00:00:00.000Z');
    const middleDate = new Date('2026-01-02T00:00:00.000Z');
    const newerDate = new Date('2026-01-03T00:00:00.000Z');

    fs.utimesSync(olderFile, olderDate, olderDate);
    fs.utimesSync(newerFile, middleDate, middleDate);
    fs.utimesSync(nestedDir, newerDate, newerDate);

    expect(listProjectArtifactEntries(rootDir, 'landing-page-1234abcd')).toEqual([
      {
        kind: 'directory',
        modifiedAt: newerDate.getTime(),
        name: 'drafts',
        path: nestedDir,
        relativePath: 'drafts',
        size: null,
      },
      {
        kind: 'file',
        modifiedAt: middleDate.getTime(),
        name: 'brief.md',
        path: newerFile,
        relativePath: path.join('drafts', 'brief.md'),
        size: expect.any(Number),
      },
      {
        kind: 'file',
        modifiedAt: olderDate.getTime(),
        name: 'notes.md',
        path: olderFile,
        relativePath: 'notes.md',
        size: expect.any(Number),
      },
    ]);
  });
});
