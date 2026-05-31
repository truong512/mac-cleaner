import { PickFolders } from '../../wailsjs/go/main/App';
import {
  defaultDirectoryForPicker,
  mergePaths,
  pathsFromText,
  pathsToText,
} from '../utils/folderPaths';

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  rows?: number;
  disabled?: boolean;
};

export function FolderPathsField({
  value,
  onChange,
  label = 'Scan folders',
  rows = 4,
  disabled = false,
}: Props) {
  async function pickFolders() {
    const existing = pathsFromText(value);
    const picked = await PickFolders(true, defaultDirectoryForPicker(existing));
    if (!picked?.length) return;
    onChange(pathsToText(mergePaths(existing, picked)));
  }

  return (
    <div className="folder-paths-field">
      <div className="folder-paths-header">
        <span className="field-label">{label}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled}
          onClick={() => void pickFolders()}
        >
          Choose folders…
        </button>
      </div>
      <textarea
        className="textarea"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="~/Documents"
        disabled={disabled}
      />
      <p className="muted folder-paths-hint">One path per line, or pick folders in Finder.</p>
    </div>
  );
}
