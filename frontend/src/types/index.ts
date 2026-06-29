export type AccountRole = 'MASTER' | 'SLAVE';
export type RiskMode = 'FIXED' | 'RISK_PERCENT' | 'RISK_USD' | 'RATIO' | 'BALANCE_PROP';

export interface Account {
  id: string;
  name: string;
  role: AccountRole;
  login: number;
  bridge_host: string;
  bridge_port: number;
  poll_interval: number;
  active: boolean;
  color: string;
  copy_enable: boolean;
  created_at: string;
  updated_at: string;
  linked_masters: string[];
}

export interface AccountForm {
  name: string;
  role: AccountRole;
  login: number;
  bridge_host: string;
  bridge_port: number;
  poll_interval: number;
  active: boolean;
  color: string;
}

export interface SlaveConfig {
  id: string;
  account_id: string;
  risk_mode: RiskMode;
  fixed_contracts: number;
  risk_percent: number;
  risk_usd: number;
  lot_multiplier: number;
  max_contracts: number;
  max_positions: number;
  autocopy_enable: boolean;
  copy_sl: boolean;
  copy_tp: boolean;
  inverse_copy: boolean;
  copy_modify: boolean;
  sync_close: boolean;
  template_id: string | null;
  delay_sec: number;
  magic_number: number;
}

export interface CopierStatus {
  running: boolean;
  uptime_seconds: number | null;
  active_masters: number;
  active_slaves: number;
  total_positions: number;
  workers: Record<string, { pid: number; alive: boolean }>;
}

export interface WSMessage {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface TestResult {
  success: boolean;
  message: string;
  balance: number | null;
  server: string | null;
}

export interface SlaveTemplate {
  id: string;
  name: string;
  risk_mode: RiskMode;
  fixed_contracts: number;
  risk_percent: number;
  risk_usd: number;
  lot_multiplier: number;
  max_contracts: number;
  max_positions: number;
  autocopy_enable: boolean;
  copy_sl: boolean;
  copy_tp: boolean;
  inverse_copy: boolean;
  copy_modify: boolean;
  sync_close: boolean;
  delay_sec: number;
  magic_number: number;
  created_at: string;
  updated_at: string;
}
