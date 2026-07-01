import { useEffect, useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input, Select, Label, Checkbox, Switch, DecimalInput } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { api } from '../lib/api';
import { useStore } from '../store';
import type { Account, SlaveConfig, SlaveTemplate } from '../types';
import { HelpCircle } from 'lucide-react';

export default function SlaveConfigPage() {
  const { accounts, copierStatus, fetchAccounts, showToast } = useStore();
  const [selectedSlave, setSelectedSlave] = useState<Account | null>(null);
  const [config, setConfig] = useState<SlaveConfig | null>(null);
  const [linkedMasters, setLinkedMasters] = useState<string[]>([]);
  const [showRiskHelp, setShowRiskHelp] = useState(false);
  const [templates, setTemplates] = useState<SlaveTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState('');

  const slaves = accounts.filter(a => a.role === 'SLAVE');
  const masters = accounts.filter(a => a.role === 'MASTER');

  useEffect(() => { fetchAccounts(); fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    try { setTemplates(await api.get<SlaveTemplate[]>('/templates')); } catch {}
  };

  const selectSlave = async (slave: Account) => {
    if (selectedSlave?.id === slave.id) { setSelectedSlave(null); setConfig(null); return; }
    setSelectedSlave(slave);
    try {
      const [cfg, links] = await Promise.all([
        api.get<SlaveConfig>(`/accounts/slaves/${slave.id}/config`),
        api.get<{slave_id:string;master_id:string}[]>(`/accounts/slaves/${slave.id}/masters`),
      ]);
      setConfig(cfg);
      setLinkedMasters(links.map(l => l.master_id));
      if (cfg.template_id) {
        const t = templates.find(tp => tp.id === cfg.template_id);
        setActiveTemplateId(t?.id || '');
      } else {
        const match = templates.find(t =>
          t.risk_mode === cfg.risk_mode &&
          t.fixed_contracts === cfg.fixed_contracts &&
          t.risk_percent === cfg.risk_percent &&
          t.risk_usd === (cfg.risk_usd ?? 50) &&
          t.lot_multiplier === cfg.lot_multiplier &&
          t.max_contracts === cfg.max_contracts &&
          t.max_positions === cfg.max_positions &&
          t.autocopy_enable === cfg.autocopy_enable &&
          t.delay_sec === cfg.delay_sec &&
          t.magic_number === (cfg.magic_number ?? 0) &&
          t.copy_modify === cfg.copy_modify &&
          t.sync_close === cfg.sync_close &&
          t.daily_loss_enabled === cfg.daily_loss_enabled &&
          t.daily_loss_limit === cfg.daily_loss_limit &&
        t.daily_profit_enabled === cfg.daily_profit_enabled &&
        t.daily_profit_limit === cfg.daily_profit_limit
      );
        setActiveTemplateId(match?.id || '');
      }
    } catch { showToast('Error cargando config', 'error'); }
  };

  const saveConfig = async () => {
    if (!selectedSlave || !config) return;
    try {
      await api.put(`/accounts/slaves/${selectedSlave.id}/config`, config);
      await api.put(`/accounts/slaves/${selectedSlave.id}/masters`, { master_ids: linkedMasters });
      fetchAccounts();
      showToast('Guardado', 'ok');
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Error', 'error'); }
  };

  const toggleMaster = (masterId: string) => {
    setLinkedMasters(prev => prev.includes(masterId) ? prev.filter(id => id !== masterId) : [...prev, masterId]);
  };

  const applyTemplate = (templateId: string) => {
    const t = templates.find(tp => tp.id === templateId);
    if (!t || !config) return;
    setActiveTemplateId(templateId);
    setConfig({
      ...config,
      template_id: templateId,
      risk_mode: t.risk_mode,
      fixed_contracts: t.fixed_contracts,
      risk_percent: t.risk_percent,
      risk_usd: t.risk_usd,
      lot_multiplier: t.lot_multiplier,
      max_contracts: t.max_contracts,
      max_positions: t.max_positions,
      autocopy_enable: t.autocopy_enable,
      copy_sl: t.copy_sl,
      copy_tp: t.copy_tp,
      inverse_copy: t.inverse_copy,
      copy_modify: t.copy_modify,
      sync_close: t.sync_close,
      daily_loss_enabled: t.daily_loss_enabled,
      daily_loss_limit: t.daily_loss_limit,
      daily_profit_enabled: t.daily_profit_enabled,
      daily_profit_limit: t.daily_profit_limit,
      delay_sec: t.delay_sec,
      magic_number: t.magic_number,
    });
  };

  const updateConfig = (patch: Partial<SlaveConfig>) => {
    if (!config) return;
    setActiveTemplateId('');
    setConfig({ ...config, ...patch, template_id: null });
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-white">Configuracion de Slaves</h2><p className="text-sm text-zinc-500">Selecciona un slave</p></div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {slaves.map(s => (
          <>
            <Card
              key={s.id}
              className={`cursor-pointer p-4 ${selectedSlave?.id === s.id ? 'border-emerald-500/50 bg-emerald-500/5' : 'hover:border-zinc-600'}`}
              onClick={() => selectSlave(s)}
            >
              <Badge variant="warning" className="mb-2">SLAVE</Badge>
              <p className="text-sm font-medium text-white">{s.name}</p>
              <p className="text-xs text-zinc-500">Cuenta: {s.login || '—'}</p>
              {(s.linked_masters || []).length > 0 && (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-zinc-600">copia de</span>
                  {s.linked_masters.map(m => {
                    const masterColor = accounts.find(a => a.name === m)?.color || '#3b82f6';
                    return (
                    <span key={m} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{backgroundColor: masterColor + '20', color: masterColor, border: '1px solid ' + masterColor + '40'}}>{m}</span>
                    );
                  })}
                </div>
              )}
            </Card>
            {selectedSlave?.id === s.id && config && (
              <Card className="mt-2 p-6 space-y-6 col-span-full border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-white">Configurando: <span className="text-2xl font-bold">{selectedSlave.name}</span></h3>
                  <Button variant="primary" onClick={saveConfig} disabled={copierStatus.running} title={copierStatus.running ? 'Para el copiador para modificar' : ''}>Guardar</Button>
                </div>

                <div>
                  <Label className="text-sm font-medium text-zinc-300 mb-2">Masters Vinculados</Label>
                  <div className="flex flex-wrap gap-2">
                    {masters.map(m => (
                      <label key={m.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs cursor-pointer ${linkedMasters.includes(m.id) ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-zinc-800/50 border border-zinc-700 text-zinc-400'}`}>
                        <Checkbox checked={linkedMasters.includes(m.id)} onChange={() => toggleMaster(m.id)} />{m.name}
                      </label>
                    ))}
                  </div>
                </div>

                {templates.length > 0 && (
                  <div>
                    <Label>Cargar Plantilla</Label>
                    <Select value={activeTemplateId} onChange={e => { if (e.target.value) applyTemplate(e.target.value); }}>
                      <option value="">Seleccionar plantilla...</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="flex items-center gap-1 mb-1"><Label>Modo de Riesgo</Label><button onClick={() => setShowRiskHelp(!showRiskHelp)} className="text-zinc-500 hover:text-zinc-300" title="Ayuda"><HelpCircle size={14} /></button></div>
                    <Select value={config.risk_mode} onChange={e => updateConfig({risk_mode: e.target.value as SlaveConfig['risk_mode']})}>
                      <option value="FIXED">Contratos Fijos</option>
                      <option value="RISK_PERCENT">% Riesgo del Balance</option>
                      <option value="RISK_USD">Riesgo USD Fijo</option>
                      <option value="RATIO">Multiplicador del Master</option>
                      <option value="BALANCE_PROP">Proporcional al Balance</option>
                    </Select>
                    {(config.risk_mode === 'RISK_USD' || config.risk_mode === 'RISK_PERCENT') && (
                      <p className="text-xs text-amber-400 mt-1">Modo de riesgo dependiente de SL. Si el master abre sin SL, se usara <span className="font-medium">Proporcional al Balance</span> como modo por defecto.</p>
                    )}
                  </div>

                  {showRiskHelp && (
                    <div className="col-span-1 md:col-span-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 text-xs text-zinc-400 space-y-1">
                      <div className="font-medium text-zinc-300 mb-1">Modos de riesgo (Futuros):</div>
                      <div><span className="text-emerald-400 font-medium">Contratos Fijos</span> — Siempre el mismo numero de contratos</div>
                      <div><span className="text-emerald-400 font-medium">% Riesgo</span> — Calcula contratos segun % del balance y distancia SL</div>
                      <div><span className="text-emerald-400 font-medium">Riesgo USD Fijo</span> — Cantidad fija en USD a arriesgar</div>
                      <div><span className="text-emerald-400 font-medium">Multiplicador</span> — Multiplica los contratos del master</div>
                      <div><span className="text-emerald-400 font-medium">Prop. Balance</span> — Ajusta segun ratio de balances</div>
                    </div>
                  )}

                  {config.risk_mode === 'FIXED' && <div><Label>Contratos Fijos</Label><Input type="number" value={config.fixed_contracts} onChange={e => updateConfig({fixed_contracts: Number(e.target.value)})} /></div>}
                  {config.risk_mode === 'RISK_PERCENT' && <div><Label>% Riesgo</Label><DecimalInput value={config.risk_percent} onChange={v => updateConfig({risk_percent: v})} /></div>}
                  {config.risk_mode === 'RISK_USD' && <div><Label>Riesgo USD</Label><DecimalInput value={config.risk_usd ?? 50} onChange={v => updateConfig({risk_usd: v})} /></div>}
                  {config.risk_mode === 'RATIO' && <div><Label>Multiplicador</Label><DecimalInput value={config.lot_multiplier} onChange={v => updateConfig({lot_multiplier: v})} /></div>}

                  <div><Label>Max Contratos</Label><Input type="number" value={config.max_contracts} onChange={e => updateConfig({max_contracts: Number(e.target.value)})} /></div>
                  <div><Label>Max Posiciones</Label><Input type="number" value={config.max_positions} onChange={e => updateConfig({max_positions: Number(e.target.value)})} /></div>
                  <div><Label>Delay (seg)</Label><DecimalInput value={config.delay_sec} onChange={v => updateConfig({delay_sec: v})} /></div>
                  <div><Label>Magic Number</Label><Input type="number" value={config.magic_number ?? 0} onChange={e => updateConfig({magic_number: Number(e.target.value)})} /></div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-700 bg-zinc-800/30">
                  <div>
                    <p className="text-sm font-medium text-white">AutoCopy</p>
                    <p className="text-xs text-zinc-500">{config.autocopy_enable ? 'El slave esta copiando activamente' : 'El slave no copiara operaciones'}</p>
                  </div>
                  <Switch checked={config.autocopy_enable} onChange={v => updateConfig({autocopy_enable: v})} />
                </div>

                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm text-zinc-300"><Checkbox checked={config.copy_sl} onChange={e => updateConfig({copy_sl: e.target.checked})} />Copiar SL</label>
                  <label className="flex items-center gap-2 text-sm text-zinc-300"><Checkbox checked={config.copy_tp} onChange={e => updateConfig({copy_tp: e.target.checked})} />Copiar TP</label>
                  <label className="flex items-center gap-2 text-sm text-zinc-300"><Checkbox checked={config.copy_modify} onChange={e => updateConfig({copy_modify: e.target.checked})} />Copiar Modificaciones</label>
                  <label className="flex items-center gap-2 text-sm text-zinc-300"><Checkbox checked={config.sync_close} onChange={e => updateConfig({sync_close: e.target.checked})} />Cierre Sincronizado</label>
                </div>

                <div className="p-4 rounded-lg border border-zinc-700 bg-zinc-800/30 space-y-3">
                  <p className="text-sm font-medium text-white">Limites Diarios (Prop Firm)</p>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-zinc-300 min-w-[130px]">
                      <Checkbox checked={config.daily_loss_enabled} onChange={e => updateConfig({daily_loss_enabled: e.target.checked})} />
                      Max perdida
                    </label>
                    <DecimalInput value={config.daily_loss_limit ?? 0} onChange={v => updateConfig({daily_loss_limit: v})} />
                    <span className="text-xs text-zinc-500">USD</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-zinc-300 min-w-[130px]">
                      <Checkbox checked={config.daily_profit_enabled} onChange={e => updateConfig({daily_profit_enabled: e.target.checked})} />
                      Max ganancia
                    </label>
                    <DecimalInput value={config.daily_profit_limit ?? 0} onChange={v => updateConfig({daily_profit_limit: v})} />
                    <span className="text-xs text-zinc-500">USD</span>
                  </div>
                </div>
              </Card>
            )}
          </>
        ))}
      </div>
    </div>
  );
}
