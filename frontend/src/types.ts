import { model } from '../wailsjs/go/models';

export type Risk = 'safe' | 'moderate' | 'risky' | 'manual';

export type ScanItem = model.ScanItem;
export type CategorySummary = model.CategorySummary;
export type CleanupReport = model.CleanupReport;
export type CleanupFailure = model.CleanupFailure;
export type AuditLogEntry = model.AuditLogEntry;
export type InstalledApp = model.InstalledApp;
export type LeftoverFile = model.LeftoverFile;
export type LeftoverGroup = model.LeftoverGroup;
export type DuplicateGroup = model.DuplicateGroup;
export type DirNode = model.DirNode;
export type DiskSummary = model.DiskSummary;
export type PermissionStatus = model.PermissionStatus;
export type ScanProgress = {
  phase: string;
  currentPath?: string;
  scanned: number;
  total?: number;
  percent: number;
  message?: string;
};
export type AppSettings = model.AppSettings;
export type LocalSnapshot = model.LocalSnapshot;
export type StorageInsight = model.StorageInsight;
export type DockerDiskUsage = model.DockerDiskUsage;
export type DockerDiskRow = model.DockerDiskRow;
export type DockerPruneOptions = model.DockerPruneOptions;
export type DeleteResult = {
  path: string;
  success: boolean;
  error?: string;
};

export { model };
