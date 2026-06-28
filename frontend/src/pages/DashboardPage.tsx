import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/input';
import { useStore } from '../store';
import { api } from '../lib/api';
import { AlertTriangle, X } from 'lucide-react';
import type { Account, SlaveConfig, SlaveTemplate } from '../types';

export default function DashboardPage() {
  const { copierStatus, accounts, fetchStatus, logs } = useStore();
  const [confirmClose, setConfirmClose] = useState<Account | null>(null);
  const [closing, setClosing] = useState(false);
  const [slaveConfigs, setSlaveConfigs] = useState<Record<string, SlaveConfig>>({});
  const [templates, setTemplates] = useState<SlaveTemplate[]>([]);
  const [slaveStats, setSlaveStats] = useState<Record<string, {unrealized: number; positions: number}>>({});

  useEffect(() => {
    fetchStatus();
    useStore.getState().fetchAccounts();
    api.get<SlaveTemplate[]>('/templates').then(setTemplates).catch(() => {});
    const interval = setInterval(() => { fetchStatus(); fetchSlaveStats(); }, 5000);
    fetchSlaveStats();
    return () => clearInterval(interval);
  }, []);

  const fetchSlaveStats = async () => {
    try {
      const resp = await api.get<{ok: boolean; data: Record<string, {unrealized: number; positions: number}>}>('/copier/dashboard');
      if (resp.ok) setSlaveStats(resp.data);
    } catch {}
  };

  const masters = accounts.filter(a => a.role === 'MASTER' && a.active);
  const slaves = accounts.filter(a => a.role === 'SLAVE' && a.active);

  useEffect(() => {
    slaves.forEach(async (s) => {
      if (!slaveConfigs[s.id]) {
        try {
          const cfg = await api.get<SlaveConfig>(`/accounts/slaves/${s.id}/config`);
          setSlaveConfigs(prev => ({ ...prev, [s.id]: cfg }));
        } catch {}
      }
    });
  }, [slaves.map(s => s.id).join(',')]);

  const toggleAutocopy = async (slaveId: string, enabled: boolean) => {
    const cfg = slaveConfigs[slaveId];
    if (!cfg) return;
    const updated = { ...cfg, autocopy_enable: enabled };
    setSlaveConfigs(prev => ({ ...prev, [slaveId]: updated }));
    try {
      await api.put(`/accounts/slaves/${slaveId}/config`, updated);
    } catch {
      setSlaveConfigs(prev => ({ ...prev, [slaveId]: cfg }));
      useStore.getState().showToast('Error al actualizar', 'error');
    }
  };

  const toggleMasterCopy = async (master: Account, enabled: boolean) => {
    try {
      await api.put(`/accounts/${master.id}`, { copy_enable: enabled });
      useStore.getState().fetchAccounts();
    } catch {
      useStore.getState().showToast('Error al actualizar', 'error');
    }
  };

  const matchTemplate = (cfg: SlaveConfig): string | null => {
    const t = templates.find(tp =>
      tp.risk_mode === cfg.risk_mode &&
      tp.fixed_contracts === cfg.fixed_contracts &&
      tp.risk_percent === cfg.risk_percent &&
      tp.risk_usd === (cfg.risk_usd ?? 50) &&
      tp.lot_multiplier === cfg.lot_multiplier &&
      tp.max_contracts === cfg.max_contracts &&
      tp.max_positions === cfg.max_positions &&
      tp.autocopy_enable === cfg.autocopy_enable &&
      tp.delay_sec === cfg.delay_sec &&
      tp.magic_number === (cfg.magic_number ?? 0) &&
      tp.copy_modify === cfg.copy_modify &&
      tp.sync_close === cfg.sync_close
    );
    return t?.name || null;
  };

  const handleEmergencyClose = async () => {
    if (!confirmClose) return;
    setClosing(true);
    try {
      const resp = await api.post<{ok:boolean;closed:number;errors:number;error?:string}>(`/copier/emergency-close/${confirmClose.id}`);
      if (resp.ok) useStore.getState().showToast(`Cerradas ${resp.closed} posiciones en ${confirmClose.name}`, 'ok');
      else useStore.getState().showToast(resp.error || 'Error', 'error');
      fetchStatus();
    } catch (e: unknown) { useStore.getState().showToast(e instanceof Error ? e.message : 'Error', 'error'); }
    setClosing(false); setConfirmClose(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div className="relative inline-block">
          <div className="absolute inset-0 rounded-sm bg-gradient-to-r from-emerald-500/20 via-emerald-500/20 via-60% to-transparent" />
          <h2 className="relative text-2xl font-bold text-white py-2 px-3">Dashboard</h2>
        </div>
        <Badge variant={copierStatus.running ? 'success' : 'default'} className="text-sm px-3 py-1">{copierStatus.running ? 'RUNNING' : 'STOPPED'}</Badge>
      </div>

      <div><h3 className="text-base font-medium text-zinc-400 mb-3">Cuentas Master <span className="text-emerald-400">({masters.length})</span></h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {masters.length === 0 && <p className="text-sm text-zinc-600 col-span-full">No hay cuentas master configuradas.</p>}
          {masters.map(m => (
            <Card key={m.id} className={`relative overflow-hidden ${copierStatus.running ? 'border-emerald-500/20' : ''} ${m.copy_enable === false ? 'opacity-60' : ''} ${(slaveStats[m.id]?.positions ?? 0) > 0 ? 'border-emerald-500/40' : ''}`}>
              {copierStatus.running && m.copy_enable !== false && <div className="absolute inset-0 bg-emerald-500/5 animate-[pulse_3s_ease-in-out_infinite]" />}
              {(slaveStats[m.id]?.positions ?? 0) > 0 && <div className="absolute inset-0 bg-emerald-500/10 animate-[pulse_1.5s_ease-in-out_infinite] shadow-[inset_0_0_20px_rgba(34,197,94,0.15)]" />}
              <div className="relative"><CardHeader><div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full shrink-0" style={{backgroundColor: m.color || '#3b82f6', opacity: m.copy_enable === false ? 0.4 : 1}} /><CardTitle className={m.copy_enable === false ? 'text-zinc-500' : ''}>{m.name}</CardTitle></div><Badge variant="success">MASTER</Badge></CardHeader>
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">Cuenta: {m.login || '—'}</p>
                <Switch checked={m.copy_enable !== false} onChange={(v) => toggleMasterCopy(m, v)} />
              </div>
              {slaveStats[m.id] && (
                <p className="text-xs text-zinc-400">
                  <span className={slaveStats[m.id].unrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {slaveStats[m.id].unrealized >= 0 ? '+' : ''}{slaveStats[m.id].unrealized.toFixed(2)} USD
                  </span>
                  <span className="text-zinc-600 mx-2">|</span>
                  <span>{slaveStats[m.id].positions} pos.</span>
                </p>
              )}
            </div>
            </Card>
          ))}
        </div>
      </div>

      <div><h3 className="text-base font-medium text-zinc-400 mb-3">Cuentas Slave <span className="text-amber-400">({slaves.length})</span></h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {slaves.length === 0 && <p className="text-sm text-zinc-600 col-span-full">No hay cuentas slave configuradas.</p>}
          {slaves.map(s => {
            const autocopy = slaveConfigs[s.id]?.autocopy_enable ?? true;
            return (
            <Card key={s.id} className={`relative overflow-hidden ${!autocopy ? 'opacity-60 border-amber-800/40' : copierStatus.running ? 'border-amber-500/20' : ''} ${(slaveStats[s.id]?.positions ?? 0) > 0 ? 'border-amber-500/40' : ''}`}>
              {copierStatus.running && autocopy && <div className="absolute inset-0 bg-amber-500/4 animate-[pulse_3s_ease-in-out_infinite]" />}
              {(slaveStats[s.id]?.positions ?? 0) > 0 && <div className="absolute inset-0 bg-amber-500/8 animate-[pulse_1.5s_ease-in-out_infinite] shadow-[inset_0_0_20px_rgba(245,158,11,0.12)]" />}
              <div className="relative flex flex-col sm:flex-row sm:justify-between sm:gap-3">
                <div className="flex-1 min-w-0">
                  <CardHeader className="mb-2 pb-0">
                    <div className="flex items-center gap-2">
                      <CardTitle className={`text-base font-semibold text-white ${!autocopy ? 'text-zinc-500' : ''}`}>{s.name}</CardTitle>
                      <Badge variant="warning">SLAVE</Badge>
                      {!autocopy && <Badge variant="warning" className="!bg-amber-500/15 !text-amber-400 !border-amber-500/30">PAUSADO</Badge>}
                    </div>
                  </CardHeader>
                  <div className={`space-y-1 text-xs ${!autocopy ? 'text-zinc-600' : 'text-zinc-500'}`}>
                    <p>Cuenta: {s.login || '—'}</p>
                    {slaveStats[s.id] && (
                      <p className={!autocopy ? 'text-zinc-600' : 'text-zinc-300'}>
                        <span className={slaveStats[s.id].unrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {slaveStats[s.id].unrealized >= 0 ? '+' : ''}{slaveStats[s.id].unrealized.toFixed(2)} USD
                        </span>
                        <span className="text-zinc-600 mx-2">|</span>
                        <span>{slaveStats[s.id].positions} pos.</span>
                      </p>
                    )}
                    {slaveConfigs[s.id] && (
                      <p className={!autocopy ? 'text-zinc-600' : 'text-zinc-400'}>
                        Riesgo: {slaveConfigs[s.id].risk_mode === 'FIXED' ? `${slaveConfigs[s.id].fixed_contracts} contratos` :
                                 slaveConfigs[s.id].risk_mode === 'RISK_USD' ? `$${slaveConfigs[s.id].risk_usd} USD` :
                                 slaveConfigs[s.id].risk_mode === 'RISK_PERCENT' ? `${slaveConfigs[s.id].risk_percent}% balance` :
                                 slaveConfigs[s.id].risk_mode === 'RATIO' ? `x${slaveConfigs[s.id].lot_multiplier} master` :
                                 'Prop. balance'}
                        {matchTemplate(slaveConfigs[s.id]) && <span className="text-zinc-600"> ({matchTemplate(slaveConfigs[s.id])})</span>}
                      </p>
                    )}
                  </div>
                  {(s.linked_masters || []).length > 0 && (
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-zinc-600">copia de</span>
                      {s.linked_masters.map(m => {
                        const masterColor = accounts.find(a => a.name === m)?.color || '#3b82f6';
                        return (
                        <span key={m} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{backgroundColor: masterColor + '20', color: masterColor, border: '1px solid ' + masterColor + '40'}}>{m}</span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex flex-row sm:flex-col items-center sm:items-center gap-2 pt-0 sm:pt-1">
                  <Switch
                    checked={autocopy}
                    onChange={(v) => toggleAutocopy(s.id, v)}
                  />
                  <img
                    src="/stop.png"
                    alt="Emergency Close"
                    className="h-16 w-16 cursor-pointer hover:scale-110 transition-transform shrink-0"
                    onClick={() => setConfirmClose(s)}
                    title="Cerrar todas las posiciones"
                  />
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      </div>

      <div><h3 className="text-sm font-medium text-zinc-400 mb-3">Eventos Recientes</h3>
        <Card className="max-h-64 overflow-auto">
          {logs.length === 0 ? <p className="text-sm text-zinc-600 py-2">Esperando eventos...</p> :
            <div className="space-y-1 text-xs">
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 px-1 hover:bg-zinc-800/30 rounded">
                  <span className="text-zinc-600 shrink-0 w-20">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <Badge variant={log.type === 'position_open' ? 'info' : log.type === 'position_close' ? 'danger' : log.type === 'position_modify' ? 'warning' : log.type === 'copy_ok' ? 'success' : log.type === 'copy_error' ? 'danger' : 'default'}>
                    {log.type === 'position_open' ? 'OPEN' : log.type === 'position_close' ? 'CLOSE' : log.type === 'position_modify' ? 'MODIFY' : log.type === 'copy_ok' ? 'OK' : log.type === 'copy_error' ? 'FAIL' : log.type}
                  </Badge>
                  <span className="text-zinc-300 truncate">{log.message}</span>
                </div>
              ))}
            </div>}
        </Card>
      </div>

      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="w-[420px] p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-red-400 flex items-center gap-2"><AlertTriangle size={20} /> Emergency Close</h3><button onClick={() => setConfirmClose(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button></div>
            <p className="text-sm text-zinc-400 mb-2">Vas a cerrar <b className="text-white">TODAS</b> las posiciones abiertas en:</p>
            <p className="text-sm font-medium text-white mb-1">{confirmClose.name}</p>
            <p className="text-xs text-red-400 mb-4">Esta accion no se puede deshacer.</p>
            <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setConfirmClose(null)}>Cancelar</Button><Button variant="danger" size="sm" onClick={handleEmergencyClose} disabled={closing}>{closing ? 'Cerrando...' : 'Cerrar Todo'}</Button></div>
          </Card>
        </div>
      )}
    </div>
  );
}
