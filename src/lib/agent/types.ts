export type EngineName = "jev" | "gemini" | "rules";

// get_injury_report and get_waiver_wire are absent: the app has no injury,
// free agent, or ownership data, and the spec forbids adding data sources.
export type ActionId =
  | "get_roster"
  | "get_recent_performance"
  | "get_matchup_stats"
  | "answer"
  | "ask_user";

export const ACTION_IDS: ActionId[] = [
  "get_roster",
  "get_recent_performance",
  "get_matchup_stats",
  "answer",
  "ask_user",
];

export interface AgentStep {
  action: ActionId;
  resultSummary: string;
}

export interface AgentState {
  message: string;
  rosterSummary?: string;
  steps: AgentStep[];
  stepCount: number;
}

export interface RouteDecision {
  action: ActionId;
  probability: number | null; // null for rules, or when the provider omits a distribution
  confidence: number | null; // Jev only
  engine: EngineName;
  fellBack: boolean;
  latencyMs: number;
  totalTokens?: number | null; // only when the provider reports usage
}

export interface VerifyInput {
  message: string;
  resultSummaries: string[];
  draft: string;
}

export interface VerifyDecision {
  grounded: number | null;
  answersQuestion: number | null;
  quality: number | null;
  engine: EngineName;
  fellBack: boolean;
  latencyMs: number;
}

export interface DecisionEngine {
  name: EngineName;
  route(state: AgentState): Promise<RouteDecision>;
  verify(input: VerifyInput): Promise<VerifyDecision>;
}
