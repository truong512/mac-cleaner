import type { JunkPreset } from '../utils/junkPresets';
import { JUNK_PRESETS } from '../utils/junkPresets';

type Props = {
  activePresetId: string | null;
  disabled?: boolean;
  onSelect: (preset: JunkPreset) => void;
  onClear: () => void;
};

export function JunkPresetBar({ activePresetId, disabled, onSelect, onClear }: Props) {
  return (
    <div className="preset-bar">
      {JUNK_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={
            activePresetId === preset.id ? 'preset-chip active' : 'preset-chip'
          }
          disabled={disabled}
          onClick={() => onSelect(preset)}
        >
          {preset.label}
        </button>
      ))}
      {activePresetId && (
        <button type="button" className="preset-chip preset-clear" disabled={disabled} onClick={onClear}>
          Clear filter
        </button>
      )}
    </div>
  );
}
