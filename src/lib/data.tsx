import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, errorText } from './api';
import type { Dashboard } from '../types';

type DataState = { data: Dashboard | null; loading: boolean; error: string; refresh: () => Promise<void> };
const DataContext = createContext<DataState | null>(null);

/** Loads the signed-in member's events, progress, and recent sessions once, and shares them across pages. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setData(await api.dashboard()); setError(''); }
    catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <DataContext.Provider value={{ data, loading, error, refresh }}>{children}</DataContext.Provider>;
}
export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
/** Same as useData, but returns null outside the provider (for example, when signed out). */
export function useDataMaybe(): DataState | null { return useContext(DataContext); }
