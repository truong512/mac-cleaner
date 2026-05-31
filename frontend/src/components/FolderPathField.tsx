import { PickFolders } from '../../wailsjs/go/main/App';
import { defaultDirectoryForPicker, pathsFromText } from '../utils/folderPaths';

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
};

/** Single root path with a folder picker button. */
export function FolderPathField({
  value,
  onChange,
  label = 'Root path',
  disabled = false,
}: Props) {
  async function pickFolder() {
    const existing = pathsFromText(value);
    const picked = await PickFolders(false, defaultDirectoryForPicker(existing.length ? existing : [value]));
    if (picked?.[0]) {
      onChange(picked[0]);
    }
  }

  return (
    <label className="field-row folder-path-field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. ~"
        disabled={disabled}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={disabled}
        onClick={() => void pickFolder()}
      >
        Choose…
      </button>
    </label>
  );
}
