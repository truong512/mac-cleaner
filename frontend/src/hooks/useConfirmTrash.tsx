import { useCallback, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

type Pending = {
  summary: string;
  resolve: (value: boolean) => void;
};

export function useConfirmTrash() {
  const [pending, setPending] = useState<Pending | null>(null);

  const requestConfirm = useCallback((summary: string) => {
    return new Promise<boolean>((resolve) => {
      setPending({ summary, resolve });
    });
  }, []);

  const confirmDialog = pending ? (
    <ConfirmDialog
      summary={pending.summary}
      onConfirm={() => {
        pending.resolve(true);
        setPending(null);
      }}
      onCancel={() => {
        pending.resolve(false);
        setPending(null);
      }}
    />
  ) : null;

  return { requestConfirm, confirmDialog };
}
