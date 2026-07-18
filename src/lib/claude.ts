import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClaude() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Claude API key is not configured.");
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  return client;
}

export function claudeModel() {
  return process.env.CLAUDE_MODEL || "claude-sonnet-4-5";
}
