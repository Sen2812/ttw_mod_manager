/**
 * Game Definition Registry
 *
 * Central registry for all supported game definitions.
 * New games can be registered at runtime.
 */

import { GameDefinition, SupportedGame, SUPPORTED_GAMES } from "../types";

export class GameRegistry {
  private games = new Map<SupportedGame, GameDefinition>();

  /**
   * Register a game definition.
   * Overwrites any existing definition for the same game id.
   */
  register(game: GameDefinition): void {
    this.games.set(game.id, game);
  }

  /** Get a specific game definition by id */
  get(gameId: SupportedGame): GameDefinition | undefined {
    return this.games.get(gameId);
  }

  /** Get all registered game definitions */
  getAll(): GameDefinition[] {
    return Array.from(this.games.values());
  }

  /** Get all registered game ids */
  getIds(): SupportedGame[] {
    return Array.from(this.games.keys());
  }

  /** Check if a game is registered */
  has(gameId: SupportedGame): boolean {
    return this.games.has(gameId);
  }

  /** Resolve a game from its Steam App ID */
  getBySteamId(steamId: string): GameDefinition | undefined {
    return Array.from(this.games.values()).find((g) => g.steamId === steamId);
  }

  /** Resolve a game from its process name */
  getByProcessName(processName: string): GameDefinition | undefined {
    return Array.from(this.games.values()).find(
      (g) => g.processName.toLowerCase() === processName.toLowerCase(),
    );
  }
}

/** Singleton game registry — register game definitions at startup */
export const gameRegistry = new GameRegistry();
