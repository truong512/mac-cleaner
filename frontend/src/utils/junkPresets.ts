export type JunkPreset = {
  id: string;
  label: string;
  tags: string[];
};

/** Shown when a preset filter matches no scan results. */
export const PRESET_EMPTY_HINTS: Record<string, string> = {
  browser:
    'No browser cache files matched. Run Scan again after this update. Chrome/Edge/Brave use GPUCache and CacheStorage paths (not only Cache/). Safari needs Full Disk Access. Quit the browser if files are locked.',
  developer:
    'No developer cache files matched. Run Scan first, or install the tools (Xcode, Docker, etc.) whose caches this app tracks.',
  apple:
    'No Apple system cache files matched. Run Scan first. Some paths need Full Disk Access.',
  photos:
    'No Photos cache files matched. Run Scan again. Photos paths need Full Disk Access on macOS.',
  mail:
    'No Mail cache files matched. Run Scan again. Mail paths need Full Disk Access on macOS.',
};

export const JUNK_PRESETS: JunkPreset[] = [
  { id: 'developer', label: 'Developer', tags: ['developer'] },
  { id: 'browser', label: 'Browsers', tags: ['browser'] },
  { id: 'apple', label: 'Apple', tags: ['apple'] },
  { id: 'photos', label: 'Photos', tags: ['photos'] },
  { id: 'mail', label: 'Mail', tags: ['mail'] },
];

export function presetById(id: string | null): JunkPreset | undefined {
  if (!id) return undefined;
  return JUNK_PRESETS.find((p) => p.id === id);
}

export function categoryMatchesPreset(
  categoryId: string,
  preset: JunkPreset,
  categoryIdsForTags: string[]
): boolean {
  return categoryIdsForTags.includes(categoryId);
}
