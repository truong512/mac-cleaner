import { useEffect, useState } from 'react';
import { GetAppIconDataURL } from '../../wailsjs/go/main/App';

const cache = new Map<string, string>();

type Props = {
  appPath: string;
  name: string;
  size?: number;
};

export function AppIcon({ appPath, name, size = 32 }: Props) {
  const [src, setSrc] = useState(() => cache.get(appPath) ?? '');

  useEffect(() => {
    const cached = cache.get(appPath);
    if (cached) {
      setSrc(cached);
      return;
    }
    let cancelled = false;
    void GetAppIconDataURL(appPath).then((url) => {
      if (cancelled || !url) {
        return;
      }
      cache.set(appPath, url);
      setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [appPath]);

  const px = `${size}px`;
  if (src) {
    return (
      <img
        className="app-icon"
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: px, height: px }}
      />
    );
  }

  const initial = (name.trim()[0] || '?').toUpperCase();
  return (
    <span
      className="app-icon app-icon-fallback"
      aria-hidden
      style={{ width: px, height: px, fontSize: `${Math.round(size * 0.45)}px` }}
    >
      {initial}
    </span>
  );
}
