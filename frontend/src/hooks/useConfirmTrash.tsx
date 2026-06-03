import { useCallback, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

export type ConfirmDeleteChoice = 'trash' | 'permanent' | false;

type Pending = {
  summary: string;
  resolve: (value: ConfirmDeleteChoice) => void;
};

export function useConfirmTrash() {
  const [pending, setPending] = useState<Pending | null>(null);

  const requestConfirm = useCallback((summary: string) => {
    return new Promise<ConfirmDeleteChoice>((resolve) => {
      setPending({ summary, resolve });
    });
  }, []);

  const confirmDialog = pending ? (
    <ConfirmDialog
      summary={pending.summary}
      onMoveToTrash={() => {
        pending.resolve('trash');
        setPending(null);
      }}
      onDeletePermanently={() => {
        pending.resolve('permanent');
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
