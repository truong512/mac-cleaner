import { useContext } from 'react';
import { PageActiveContext } from '../components/KeepAlivePage';

export function usePageActive() {
  return useContext(PageActiveContext);
}
