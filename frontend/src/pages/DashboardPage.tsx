import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardValue } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/input';
import { useStore } from '../store';
import { api } from '../lib/api';
import { TrendingUp, TrendingDown, Wallet, BarChart3, AlertTriangle, X } from 'lucide-react';
import type { Account, SlaveConfig } from '../types';

export default function DashboardPage() {
  const { copierStatus, accounts, fetchStatus, logs } = useStore();
  const [confirmClose, setConfirmClose] = useState<Account | null>(null);
  const [closing, setClosing] = useState(false);
  const [slaveConfigs, setSlaveConfigs] = useState<Record<string, SlaveConfig>>({});

  useEffect(() => {
    fetchStatus();
    useStore.getState().fetchAccounts();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

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
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">Dashboard</h2><p className="text-sm text-zinc-500">{copierStatus.running ? 'Copiador activo' : 'Copiador detenido'}</p></div>
        <Badge variant={copierStatus.running ? 'success' : 'default'}>{copierStatus.running ? 'RUNNING' : 'STOPPED'}</Badge>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle>Masters</CardTitle><Wallet size={18} className="text-emerald-400" /></CardHeader><CardValue>{copierStatus.active_masters}</CardValue></Card>
        <Card><CardHeader><CardTitle>Slaves</CardTitle><BarChart3 size={18} className="text-blue-400" /></CardHeader><CardValue>{copierStatus.active_slaves}</CardValue></Card>
        <Card><CardHeader><CardTitle>Posiciones</CardTitle><TrendingUp size={18} className="text-amber-400" /></CardHeader><CardValue>{copierStatus.total_positions}</CardValue><p className="text-xs text-zinc-600 mt-1">contratos abiertos</p></Card>
        <Card><CardHeader><CardTitle>Uptime</CardTitle><TrendingDown size={18} className="text-purple-400" /></CardHeader>
          <CardValue>{copierStatus.uptime_seconds ? `${Math.floor(copierStatus.uptime_seconds/60)}m ${Math.floor(copierStatus.uptime_seconds%60)}s` : '--'}</CardValue>
        </Card>
      </div>

      <div><h3 className="text-sm font-medium text-zinc-400 mb-3">Cuentas Master</h3>
        <div className="grid grid-cols-3 gap-4">
          {masters.length === 0 && <p className="text-sm text-zinc-600 col-span-3">No hay cuentas master configuradas.</p>}
          {masters.map(m => (
            <Card key={m.id}><CardHeader><CardTitle>{m.name}</CardTitle><Badge variant="success">MASTER</Badge></CardHeader>
              <p className="text-xs text-zinc-500">Cuenta: {m.login || '—'}</p>
            </Card>
          ))}
        </div>
      </div>

      <div><h3 className="text-sm font-medium text-zinc-400 mb-3">Cuentas Slave</h3>
        <div className="grid grid-cols-3 gap-4">
          {slaves.length === 0 && <p className="text-sm text-zinc-600 col-span-3">No hay cuentas slave configuradas.</p>}
          {slaves.map(s => {
            const autocopy = slaveConfigs[s.id]?.autocopy_enable ?? true;
            return (
            <Card key={s.id} className={!autocopy ? 'opacity-60 border-amber-800/40' : ''}><CardHeader className="mb-2">
              <div className="flex items-center gap-2">
                <CardTitle className={!autocopy ? 'text-zinc-500' : ''}>{s.name}</CardTitle>
                <Badge variant="warning">SLAVE</Badge>
                {!autocopy && <Badge variant="warning" className="!bg-amber-500/15 !text-amber-400 !border-amber-500/30">PAUSADO</Badge>}
              </div>
              <Switch
                checked={autocopy}
                onChange={(v) => toggleAutocopy(s.id, v)}
              />
            </CardHeader>
              <div className={`space-y-1 text-xs ${!autocopy ? 'text-zinc-600' : 'text-zinc-500'}`}><p>Cuenta: {s.login || '—'}</p></div>
              {(s.linked_masters || []).length > 0 && (
                <div className="mt-2 flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-zinc-600">copia de</span>
                  {s.linked_masters.map(m => (
                    <span key={m} className={`text-[10px] px-1.5 py-0.5 rounded ${!autocopy ? 'bg-zinc-800/50 text-zinc-600' : 'bg-zinc-800 text-zinc-400'}`}>{m}</span>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-end">
                <button onClick={() => setConfirmClose(s)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors" title="Cerrar todas las posiciones">
                  <AlertTriangle size={12} /> Emergency Close
                </button>
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
                  <Badge variant={log.type === 'position_open' ? 'success' : log.type === 'position_close' ? 'danger' : log.type === 'position_modify' ? 'warning' : log.type === 'copy_ok' ? 'success' : log.type === 'copy_error' ? 'danger' : 'default'}>
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
