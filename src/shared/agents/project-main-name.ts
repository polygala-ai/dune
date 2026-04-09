const PROJECT_MAIN_AGENT_NAMES = [
  'Paul Atreides',
  'Lady Jessica',
  'Chani',
  'Stilgar',
  'Duncan Idaho',
  'Gurney Halleck',
  'Liet-Kynes',
  'Thufir Hawat',
  'Princess Irulan',
  'Alia Atreides',
  'Leto Atreides',
  'Reverend Mother Mohiam',
] as const;

function hashProjectId(projectId: string) {
  let hash = 0;

  for (const character of projectId.trim() || 'project') {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function createProjectMainAgentName(projectId: string) {
  return PROJECT_MAIN_AGENT_NAMES[
    hashProjectId(projectId) % PROJECT_MAIN_AGENT_NAMES.length
  ] ?? PROJECT_MAIN_AGENT_NAMES[0];
}
