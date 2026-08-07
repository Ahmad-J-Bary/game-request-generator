import type { Game } from "@grq/api-bindings";

/**
 * Extracts the `package_name` value from a request template body.
 * The template always carries a line like `package_name=com.example.app`.
 * The value is captured until whitespace, `&`, `;` or a line break so that
 * query-style parameters right after it do not pollute the result.
 */
export function extractPackageName(template?: string | null): string | null {
  if (!template) return null;
  const match = template.match(/package_name\s*=\s*([^\s&;\r\n]+)/i);
  if (!match || !match[1]) return null;
  const value = match[1].trim();
  return value || null;
}

/** A package value is valid when it only contains package-safe characters. */
const PACKAGE_VALUE_RE = /^[A-Za-z0-9_.-]+$/;

export function isValidPackageValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0 && PACKAGE_VALUE_RE.test(value);
}

/** Splits a name into meaningful keywords (ignoring words under 3 chars). */
function toKeywords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s\-_]+/)
    .filter((k) => k.length >= 3);
}

/**
 * Predicts which game a given account name most likely belongs to, using the
 * same keyword matching strategy used by the Telegram auto-select (shared here
 * so both add-account flows behave identically). Used internally for label/UX
 * only and never raises a warning on its own.
 */
export function predictGameByAccountName(
  accountName: string,
  games: Game[],
): Game | null {
  const accountKeywords = toKeywords(accountName || "");
  if (accountKeywords.length === 0) return null;

  let bestGame: Game | null = null;
  let maxMatches = 0;

  for (const game of games) {
    const gameKeywords = toKeywords(game.name);
    let matches = 0;
    for (const gk of gameKeywords) {
      if (accountKeywords.some((ak) => ak.includes(gk) || gk.includes(ak))) {
        matches++;
      }
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestGame = game;
    } else if (
      matches === maxMatches &&
      matches > 0 &&
      bestGame &&
      game.name.length > bestGame.name.length
    ) {
      bestGame = game;
    }
  }

  return bestGame && maxMatches > 0 ? bestGame : null;
}

export type AccountGameAnalysis =
  | {
      status: "missing-package";
      accountPackage: string | null;
      gamePackage: string | null;
      predictedGame: Game | null;
    }
  | {
      status: "match";
      accountPackage: string;
      gamePackage: string;
      predictedGame: Game | null;
    }
  | {
      status: "unknown";
      accountPackage: string | null;
      gamePackage: string | null;
      predictedGame: Game | null;
    }
  | {
      status: "game-no-package";
      accountPackage: string | null;
      gamePackage: null;
      predictedGame: Game | null;
      otherGame: Game | null;
    }
  | {
      status: "mismatch";
      accountPackage: string;
      gamePackage: string;
      predictedGame: Game | null;
      otherGame: Game | null;
    };

export interface AnalyzeAccountGameInput {
  accountName?: string;
  template?: string | null;
  selectedGameId?: number;
  games: Game[];
}

/**
 * Two-step verification of which game an account belongs to when it is added:
 *
 * 1. Name → game prediction (informational, internal only).
 * 2. package_name comparison against the selected game's stored package.
 *
 * The stored package is authoritative, so the comparison runs for every
 * account (including the first one of a game). It is only skipped for legacy
 * games that have no stored package yet ("game-no-package").
 *
 * A template without a valid `package_name` line produces "missing-package",
 * which the caller should treat as a blocking error. A genuine mismatch
 * produces "mismatch" (blocking) and resolves which other game the account
 * actually belongs to when one exists.
 */
export function analyzeAccountGame({
  accountName,
  template,
  selectedGameId,
  games,
}: AnalyzeAccountGameInput): AccountGameAnalysis {
  const rawAccountPackage = extractPackageName(template);
  const accountPackage = isValidPackageValue(rawAccountPackage) ? rawAccountPackage : null;
  const selectedGame = selectedGameId
    ? games.find((g) => g.id === selectedGameId) ?? null
    : null;
  const gamePackage = (selectedGame?.package_name || "").trim() || null;
  const predictedGame = predictGameByAccountName(accountName || "", games);

  if (!accountPackage) {
    return {
      status: "missing-package",
      accountPackage: rawAccountPackage,
      gamePackage,
      predictedGame,
    };
  }

  if (!selectedGame) {
    return {
      status: "unknown",
      accountPackage,
      gamePackage,
      predictedGame,
    };
  }

  // Legacy game with no stored package yet: nothing authoritative to compare
  // against, so the step-2 check is skipped (non-blocking). Still resolve which
  // other game the account's package belongs to so the notice can name it.
  if (!gamePackage) {
    return {
      status: "game-no-package",
      accountPackage,
      gamePackage: null,
      predictedGame,
      otherGame: findGameByPackage(games, accountPackage, selectedGameId),
    };
  }

  if (gamePackage.toLowerCase() === accountPackage.toLowerCase()) {
    return {
      status: "match",
      accountPackage,
      gamePackage,
      predictedGame,
    };
  }

  // Mismatch: find any OTHER game that expects this exact package so the
  // warning can name it.
  return {
    status: "mismatch",
    accountPackage,
    gamePackage,
    predictedGame,
    otherGame: findGameByPackage(games, accountPackage, selectedGameId),
  };
}

/** Finds a game other than `excludeId` whose stored package matches (case-insensitive). */
function findGameByPackage(
  games: Game[],
  accountPackage: string,
  excludeId: number | null | undefined,
): Game | null {
  return (
    games.find(
      (g) =>
        g.id !== excludeId &&
        (g.package_name || "").trim().toLowerCase() ===
          accountPackage.toLowerCase(),
    ) ?? null
  );
}
