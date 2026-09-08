import { create } from 'zustand';
import { api } from '../lib/api';
import type { Account, CopierStatus } from '../types';

interface LogEntry { timestamp: string; message: string; type: string; }

interface AppState {
  copierStatus: CopierStatus; accounts: Account[]; logs: LogEntry[]; version: string;
  wsConnected: boolean;
  toast: { message: string; type: 'ok' | 'error' | 'info' } | null;
  fetchStatus: () => Promise<void>; fetchAccounts: () => Promise<void>;
  addLog: (entry: LogEntry) => void;
  setWsConnected: (connected: boolean) => void;
  showToast: (message: string, type?: 'ok' | 'error' | 'info') => void;
  clearToast: () => void;
}

const MAX_LOGS = 100;

export const useStore = create<AppState>((set, get) => ({
  copierStatus: { running: false, uptime_seconds: null, active_masters: 0, active_slaves: 0, total_positions: 0, workers: {}, nt8_connected: false, nt8_last_heartbeat: null },
  accounts: [], logs: [], version: "", wsConnected: false, toast: null,

  fetchStatus: async () => {
    try {
      const s = await api.get<CopierStatus>('/copier/status');
      const h = await api.get<{ version: string }>('/system/health');
      set({ copierStatus: s, version: h.version });
    } catch {}
  },

  fetchAccounts: async () => {
    try { const list = await api.get<Account[]>('/accounts'); set({ accounts: list }); }
    catch {}
  },

  addLog: (entry) => set(state => ({ logs: [entry, ...state.logs].slice(0, MAX_LOGS) })),

  setWsConnected: (connected) => set({ wsConnected: connected }),

  showToast: (message, type = 'info') => { set({ toast: { message, type } }); setTimeout(() => get().clearToast(), 4000); },

  clearToast: () => set({ toast: null }),
}));