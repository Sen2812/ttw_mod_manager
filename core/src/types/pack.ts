/**
 * Pack file type definitions
 * Represents the .pack binary format used by Total War games.
 */

/** Pack file header metadata returned from quick header read */
export interface PackHeaderData {
  path: string;
  isMovie: boolean;
  dependencyPacks: string[];
}
