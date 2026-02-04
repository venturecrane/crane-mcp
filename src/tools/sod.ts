/**
 * crane_sod tool - Start of Day / Session initialization
 */

import { z } from "zod";
import { homedir } from "os";
import { CraneApi, Venture } from "../lib/crane-api.js";
import {
  getCurrentRepoInfo,
  findVentureByOrg,
  findRepoForVenture,
  scanLocalRepos,
} from "../lib/repo-scanner.js";

export const sodInputSchema = z.object({
  venture: z
    .string()
    .optional()
    .describe("Venture code to work on (skips selection if provided)"),
});

export type SodInput = z.infer<typeof sodInputSchema>;

export interface SodResult {
  status: "valid" | "needs_navigation" | "needs_clone" | "select_venture" | "error";
  current_dir: string;
  detected_venture?: string;
  detected_repo?: string;
  target_venture?: string;
  target_path?: string;
  clone_command?: string;
  nav_command?: string;
  session_id?: string;
  last_handoff?: string;
  ventures?: Array<{ code: string; name: string; installed: boolean }>;
  message: string;
}

function getApiKey(): string | null {
  // Check environment variable
  if (process.env.CRANE_CONTEXT_KEY) {
    return process.env.CRANE_CONTEXT_KEY;
  }
  return null;
}

function getAgentName(): string {
  try {
    const hostname = process.env.HOSTNAME || require("os").hostname() || "unknown";
    return `crane-mcp-${hostname}`;
  } catch {
    return "crane-mcp-unknown";
  }
}

export async function executeSod(input: SodInput): Promise<SodResult> {
  const cwd = process.cwd();

  // Check for API key
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      status: "error",
      current_dir: cwd,
      message:
        "CRANE_CONTEXT_KEY not found.\n\n" +
        "Start Claude with Infisical:\n" +
        "  infisical run --path /vc -- claude",
    };
  }

  const api = new CraneApi(apiKey);

  // Fetch ventures
  let ventures: Venture[];
  try {
    ventures = await api.getVentures();
  } catch (error) {
    return {
      status: "error",
      current_dir: cwd,
      message: "Failed to connect to Crane API. Check your network connection.",
    };
  }

  // Check current directory
  const currentRepo = getCurrentRepoInfo();

  if (currentRepo) {
    // We're in a git repo - check if it's a known venture
    const venture = findVentureByOrg(ventures, currentRepo.org);

    if (venture) {
      // Valid venture repo - start session
      try {
        const fullRepo = `${currentRepo.org}/${currentRepo.repo}`;
        const session = await api.startSession({
          venture: venture.code,
          repo: fullRepo,
          agent: getAgentName(),
        });

        return {
          status: "valid",
          current_dir: cwd,
          detected_venture: venture.code,
          detected_repo: fullRepo,
          session_id: session.session.id,
          last_handoff: session.last_handoff?.summary,
          message:
            `Context valid.\n\n` +
            `Venture: ${venture.name} (${venture.code})\n` +
            `Repo: ${fullRepo}\n` +
            `Branch: ${currentRepo.branch}\n` +
            `Session: ${session.session.id}` +
            (session.last_handoff
              ? `\n\nLast handoff:\n${session.last_handoff.summary}`
              : ""),
        };
      } catch (error) {
        return {
          status: "error",
          current_dir: cwd,
          detected_venture: venture.code,
          message: "Failed to start session. Check API connectivity.",
        };
      }
    }
  }

  // Not in a valid venture repo
  // If venture code was provided, guide to that venture
  if (input.venture) {
    const targetVenture = ventures.find((v) => v.code === input.venture);

    if (!targetVenture) {
      return {
        status: "error",
        current_dir: cwd,
        message:
          `Unknown venture: ${input.venture}\n\n` +
          `Available: ${ventures.map((v) => v.code).join(", ")}`,
      };
    }

    // Check if we have this venture's repo locally
    const localRepo = findRepoForVenture(targetVenture);

    if (localRepo) {
      return {
        status: "needs_navigation",
        current_dir: cwd,
        target_venture: targetVenture.code,
        target_path: localRepo.path,
        nav_command: `cd ${localRepo.path} && claude`,
        message:
          `To work on ${targetVenture.name}:\n\n` +
          `  cd ${localRepo.path} && claude\n\n` +
          `Then run crane_sod again.`,
      };
    } else {
      // Need to clone
      const suggestedPath = `${homedir()}/dev/${targetVenture.code}-console`;
      const cloneUrl = `git@github.com:${targetVenture.org}/${targetVenture.code}-console.git`;

      return {
        status: "needs_clone",
        current_dir: cwd,
        target_venture: targetVenture.code,
        target_path: suggestedPath,
        clone_command: `git clone ${cloneUrl} ${suggestedPath}`,
        nav_command: `cd ${suggestedPath} && claude`,
        message:
          `Repo for ${targetVenture.name} not found locally.\n\n` +
          `Clone it (adjust repo name if needed):\n` +
          `  git clone ${cloneUrl} ${suggestedPath}\n\n` +
          `Then:\n` +
          `  cd ${suggestedPath} && claude`,
      };
    }
  }

  // No venture specified - show options
  const localRepos = scanLocalRepos();
  const ventureList = ventures.map((v) => {
    const repo = localRepos.find(
      (r) => r.org.toLowerCase() === v.org.toLowerCase()
    );
    return {
      code: v.code,
      name: v.name,
      installed: !!repo,
      path: repo?.path,
    };
  });

  return {
    status: "select_venture",
    current_dir: cwd,
    ventures: ventureList.map((v) => ({
      code: v.code,
      name: v.name,
      installed: v.installed,
    })),
    message:
      `Not in a venture repo.\n\n` +
      `Current directory: ${cwd}\n` +
      (currentRepo
        ? `Git remote: ${currentRepo.org}/${currentRepo.repo} (not a known venture)\n`
        : `Not a git repository.\n`) +
      `\nAvailable ventures:\n` +
      ventureList
        .map(
          (v) =>
            `  ${v.code} - ${v.name} ${v.installed ? `[${v.path}]` : "[not installed]"}`
        )
        .join("\n") +
      `\n\nCall crane_sod with venture parameter to continue.\n` +
      `Example: crane_sod(venture: "vc")`,
  };
}
