export interface RepoPRConfig {
  owner: string;
  repo: string;
  reviewerAgentId: string;
}

export interface PRReviewerConfig {
  repos: RepoPRConfig[];
  githubToken: string;
  stateFilePath: string;
  pollIntervalMs: number;
}

export interface PRReviewerState {
  processedPrs: Record<string, number[]>;
}
