/**
 * Compatibility / collision detection types
 */

export interface PackFileCollision {
  firstPackName: string;
  secondPackName: string;
  fileName: string;
  areSameSize?: boolean;
}

export interface PackTableCollision extends PackFileCollision {
  secondFileName: string;
  key: string;
  value: string;
}

export type DBFileName = string;
export type DBFieldName = string;
export type PackName = string;
export type PackedFileSuffix = string;

export interface DBRefOrigin {
  originDBFileName: DBFileName;
  targetDBFileName: DBFileName;
  value: string;
  originFieldName: DBFieldName;
  targetFieldName: DBFieldName;
  originFileSuffix: PackedFileSuffix;
}

export interface PackTableReferences {
  ownKeys: Record<DBFileName, Record<DBFieldName, string[]>>;
  refs: Record<DBFileName, Record<DBFieldName, string[]>>;
  refOrigins: Record<DBFileName, DBRefOrigin[]>;
}

export interface UniqueIdsCollision {
  tableName: string;
  fieldName: string;
  value: UniqueId;
  valueTwo: UniqueId;
  firstPackName: string;
  secondPackName?: string;
}

export interface UniqueId {
  value: string;
  packFileName: string;
  tableRow: string[];
  packName: string;
}

export interface ScriptListenerCollision {
  packFileName: string;
  value: ScriptListener;
  valueTwo: ScriptListener;
  firstPackName: string;
  secondPackName?: string;
}

export interface FileAnalysisError {
  msg: string;
  lineNum?: number;
  colNum?: number;
  packName: string;
  packFileName: string;
}

export interface FileToFileReference {
  reference: string;
  packName: string;
  packFileName: string;
}

export interface ScriptListener {
  value: string;
  packFileName: string;
  packName: string;
  position: number;
}

export interface PackCollisions {
  packFileCollisions: PackFileCollision[];
  packTableCollisions: PackTableCollision[];
  missingTableReferences: Record<PackName, DBRefOrigin[]>;
  uniqueIdsCollisions: Record<PackName, UniqueIdsCollision[]>;
  scriptListenerCollisions: Record<PackName, ScriptListenerCollision[]>;
  packFileAnalysisErrors: Record<string, Record<DBFileName, FileAnalysisError[]>>;
  missingFileRefs: Record<PackName, Record<DBFileName, FileToFileReference[]>>;
}
