import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input, Select, Label, Checkbox, DecimalInput } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { api } from '../lib/api';
import { useStore } from '../store';
import type { Account, AccountForm, TestResult } from '../types';
import { Plus, Trash2, Wifi, X, Edit3 } from 'lucide-react';

const emptyForm: AccountForm = {
  name: '', role: 'MASTER', login: '',
  bridge_host: 'localhost', bridge_port: 5555,
  poll_interval: 0.5, active: true, color: '#3b82f6',
};

function AccountGroup({ label, accounts, editing, form, setForm, onTest, testing, testResults, copierRunning, allAccounts, onEdit, onDeleteClick, onSave, onCancel }: {
  label: string;
  accounts: Account[];
  editing: Account | null;
  form: AccountForm;
  setForm: (f: AccountForm) => void;
  onTest: (id: string) => void;
  testing: string | null;
  testResults: Record<string, TestResult>;
  copierRunning: boolean;
  allAccounts: Account[];
  onEdit: (a: Account) => void;
  onDeleteClick: (a: Account) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-600">{label}</p>
      {accounts.map(a => (
        <div key={a.id}>
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <Badge variant={a.role === 'MASTER' ? 'success' : 'warning'}>{a.role}</Badge>
              <div>
                <p className="text-sm font-medium text-white">{a.name}</p>
                <p className="text-xs text-zinc-500">Cuenta: {a.login || '—'}</p>
                {a.role === 'SLAVE' && (a.linked_masters || []).length > 0 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className="text-[10px] text-zinc-600">copia de</span>
                    {a.linked_masters.map(m => {
                      const masterColor = allAccounts.find(ac => ac.name === m)?.color || '#3b82f6';
                      return (
                      <span key={m} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{backgroundColor: masterColor + '20', color: masterColor, border: '1px solid ' + masterColor + '40'}}>{m}</span>
                      );
                    })}
                  </div>
                )}
              </div>
              {!a.active && <Badge variant="danger">Inactivo</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {testResults[a.id] && <Badge variant={testResults[a.id].success ? 'success' : 'danger'}>{testResults[a.id].message || (testResults[a.id].success ? 'OK' : 'Fallo')}</Badge>}
              <Button variant="outline" size="sm" onClick={() => onTest(a.id)} disabled={testing === a.id}><Wifi size={14} /> {testing === a.id ? '...' : 'Test'}</Button>
              <Button variant="ghost" size="sm" onClick={() => onEdit(a)} disabled={copierRunning} title={copierRunning ? 'Para el copiador para editar' : ''}><Edit3 size={14} /></Button>
              <Button variant="ghost" size="sm" onClick={() => onDeleteClick(a)} disabled={copierRunning} title={copierRunning ? 'Para el copiador para eliminar' : ''}><Trash2 size={14} className="text-red-400" /></Button>
            </div>
          </Card>
          {editing?.id === a.id && (
            <Card className="mt-2 p-4 space-y-4 border-emerald-500/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">Editar {a.name}</h3>
                <Button variant="ghost" size="sm" onClick={onCancel}><X size={14} /></Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Nombre</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                <div><Label>Rol</Label><Select value={form.role} onChange={e => setForm({...form, role: e.target.value as 'MASTER'|'SLAVE'})}><option value="MASTER">MASTER</option><option value="SLAVE">SLAVE</option></Select></div>
                <div><Label>Cuenta NT8</Label><Input value={form.login||''} onChange={e => setForm({...form, login: e.target.value})} placeholder="Nombre exacto en NT8 (Sim101...)" /></div>
                <div><Label>Bridge Host</Label><Input value={form.bridge_host} onChange={e => setForm({...form, bridge_host: e.target.value})} /></div>
                <div><Label>Bridge Port</Label><Input type="number" value={form.bridge_port} onChange={e => setForm({...form, bridge_port: Number(e.target.value)})} /></div>
                <div><Label>Poll Interval (s)</Label><DecimalInput value={form.poll_interval} onChange={v => setForm({...form, poll_interval: v})} /></div>
                <div className="flex items-end gap-2 pb-1"><Checkbox checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} /><Label>Activo</Label></div>
                {form.role === 'MASTER' && (
                  <div className="flex items-end gap-2 pb-1">
                    <input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} className="h-10 w-10 rounded border border-zinc-700 bg-zinc-800/50 cursor-pointer" />
                    <Label>Color</Label>
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end"><Button variant="ghost" onClick={onCancel}>Cancelar</Button><Button variant="primary" onClick={onSave}>Guardar</Button></div>
            </Card>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AccountsPage() {
  const { accounts, copierStatus, fetchAccounts, showToast } = useStore();
  const copierRunning = copierStatus.running;
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [showNewForm, setShowNewForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [defaultPort, setDefaultPort] = useState(5555);

  useEffect(() => {
    fetchAccounts();
    fetch('/api/system/bridge-config')
      .then(r => r.json())
      .then(d => { if (d.ok) setDefaultPort(d.port); })
      .catch(() => {});
  }, []);

  const resetForm = () => { setForm({ ...emptyForm, bridge_port: defaultPort }); setEditing(null); setShowNewForm(false); };

  const handleSubmit = async () => {
    try {
      if (editing) {
        await api.put(`/accounts/${editing.id}`, form);
        showToast('Cuenta actualizada', 'ok');
      } else {
        await api.post('/accounts', form);
        showToast('Cuenta creada', 'ok');
      }
      resetForm(); fetchAccounts();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try { await api.delete(`/accounts/${id}`); showToast('Eliminada', 'ok'); fetchAccounts(); setDeleteTarget(null); }
    catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Error', 'error'); }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const r = await api.post<TestResult>(`/accounts/${id}/test`);
      setTestResults(prev => ({ ...prev, [id]: r }));
      showToast(r.success ? 'Bridge OK' : r.message, r.success ? 'ok' : 'error');
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Error', 'error'); }
    setTesting(null);
  };

  const editAccount = (a: Account) => {
    setEditing(a);
    setShowNewForm(false);
    setForm({ name: a.name, role: a.role, login: a.login, bridge_host: a.bridge_host, bridge_port: a.bridge_port, poll_interval: a.poll_interval, active: a.active, color: a.color || '#3b82f6' });
  };

  const openNew = (role: Account['role']) => { setEditing(null); setForm({ ...emptyForm, role, bridge_port: defaultPort }); setShowNewForm(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">Cuentas NinjaTrader</h2><p className="text-sm text-zinc-500">{accounts.length} cuentas</p></div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => openNew('MASTER')} disabled={copierRunning} title={copierRunning ? 'Para el copiador para crear cuentas' : ''}><Plus size={14} /> Master</Button>
          <Button variant="outline" onClick={() => openNew('SLAVE')} disabled={copierRunning} title={copierRunning ? 'Para el copiador para crear cuentas' : ''}><Plus size={14} /> Slave</Button>
        </div>
      </div>

      {showNewForm && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Nueva Cuenta</h3>
            <Button variant="ghost" size="sm" onClick={resetForm}><X size={14} /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Nombre</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><Label>Rol</Label><Select value={form.role} onChange={e => setForm({...form, role: e.target.value as 'MASTER'|'SLAVE'})}><option value="MASTER">MASTER</option><option value="SLAVE">SLAVE</option></Select></div>
            <div><Label>Cuenta NT8</Label><Input value={form.login||''} onChange={e => setForm({...form, login: e.target.value})} placeholder="Nombre exacto en NT8 (Sim101...)" /></div>
            <div><Label>Bridge Host</Label><Input value={form.bridge_host} onChange={e => setForm({...form, bridge_host: e.target.value})} /></div>
            <div><Label>Bridge Port</Label><Input type="number" value={form.bridge_port} onChange={e => setForm({...form, bridge_port: Number(e.target.value)})} /></div>
            <div><Label>Poll Interval (s)</Label><DecimalInput value={form.poll_interval} onChange={v => setForm({...form, poll_interval: v})} /></div>
            <div className="flex items-end gap-2 pb-1"><Checkbox checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} /><Label>Activo</Label></div>
            {form.role === 'MASTER' && (
              <div className="flex items-end gap-2 pb-1">
                <input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} className="h-10 w-10 rounded border border-zinc-700 bg-zinc-800/50 cursor-pointer" />
                <Label>Color</Label>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" onClick={resetForm}>Cancelar</Button><Button variant="primary" onClick={handleSubmit}>Crear</Button></div>
        </Card>
      )}

      <div className="space-y-6">
        <AccountGroup
          label="Masters"
          accounts={accounts.filter(a => a.role === 'MASTER')}
          editing={editing}
          form={form}
          setForm={setForm}
          onTest={handleTest}
          testing={testing}
          testResults={testResults}
          copierRunning={copierRunning}
          allAccounts={accounts}
          onEdit={editAccount}
          onDeleteClick={setDeleteTarget}
          onSave={handleSubmit}
          onCancel={resetForm}
        />
        {accounts.some(a => a.role === 'MASTER') && accounts.some(a => a.role === 'SLAVE') && (
          <div className="border-t border-zinc-800" />
        )}
        <AccountGroup
          label="Slaves"
          accounts={accounts.filter(a => a.role === 'SLAVE')}
          editing={editing}
          form={form}
          setForm={setForm}
          onTest={handleTest}
          testing={testing}
          testResults={testResults}
          copierRunning={copierRunning}
          allAccounts={accounts}
          onEdit={editAccount}
          onDeleteClick={setDeleteTarget}
          onSave={handleSubmit}
          onCancel={resetForm}
        />
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="w-[400px] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-red-400">Eliminar Cuenta</h3>
              <button onClick={() => setDeleteTarget(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <p className="text-sm text-zinc-400 mb-2">Vas a eliminar permanentemente:</p>
            <p className="text-sm font-medium text-white mb-1">{deleteTarget.name}</p>
            <p className="text-xs text-zinc-500 mb-4">({deleteTarget.role}) Cuenta: {deleteTarget.login || '—'}</p>
            <p className="text-xs text-red-400 mb-4">Esta accion no se puede deshacer.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(deleteTarget.id)}>Eliminar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
