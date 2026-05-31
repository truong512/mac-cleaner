/** Split textarea contents into normalized folder paths. */
export function pathsFromText(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Join paths for display in a textarea. */
export function pathsToText(paths: string[]): string {
  return paths.join('\n');
}

/** Merge newly picked paths with existing ones (deduplicated, stable order). */
export function mergePaths(existing: string[], picked: string[]): string[] {
  const seen = new Set(existing);
  const out = [...existing];
  for (const p of picked) {
    const trimmed = p.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** First path, or empty — used as the dialog's starting directory. */
export function defaultDirectoryForPicker(paths: string[]): string {
  return paths[0] ?? '';
}
