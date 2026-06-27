import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input, Select, Label, Checkbox } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { api } from '../lib/api';
import { useStore } from '../store';
import type { Account, AccountForm, TestResult } from '../types';
import { Plus, Trash2, Wifi, X, Edit3 } from 'lucide-react';

const emptyForm: AccountForm = {
  name: '', role: 'MASTER', login: '', password: '',
  bridge_host: 'localhost', bridge_port: 5555,
  poll_interval: 0.5, active: true,
};

function AccountGroup({ label, accounts, testResults, testing, onTest, onEdit, onDelete }: {
  label: string;
  accounts: Account[];
  testResults: Record<string, TestResult>;
  testing: string | null;
  onTest: (id: string) => void;
  onEdit: (a: Account) => void;
  onDelete: (id: string) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-600">{label}</p>
      {accounts.map(a => (
        <Card key={a.id} className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Badge variant={a.role === 'MASTER' ? 'success' : 'warning'}>{a.role}</Badge>
            <div>
              <p className="text-sm font-medium text-white">{a.name}</p>
              <p className="text-xs text-zinc-500">Cuenta: {a.login || '—'}</p>
              {a.role === 'SLAVE' && (a.linked_masters || []).length > 0 && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="text-[10px] text-zinc-600">copia de</span>
                  {a.linked_masters.map(m => (
                    <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{m}</span>
                  ))}
                </div>
              )}
            </div>
            {!a.active && <Badge variant="danger">Inactivo</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {testResults[a.id] && <Badge variant={testResults[a.id].success ? 'success' : 'danger'}>{testResults[a.id].message || (testResults[a.id].success ? 'OK' : 'Fallo')}</Badge>}
            <Button variant="outline" size="sm" onClick={() => onTest(a.id)} disabled={testing === a.id}><Wifi size={14} /> {testing === a.id ? '...' : 'Test'}</Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit(a)}><Edit3 size={14} /></Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(a.id)}><Trash2 size={14} className="text-red-400" /></Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function AccountsPage() {
  const { accounts, fetchAccounts, showToast } = useStore();
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  useEffect(() => { fetchAccounts(); }, []);

  const resetForm = () => { setForm(emptyForm); setEditing(null); setShowForm(false); };

  const handleSubmit = async () => {
    try {
      if (editing) {
        const body = { ...form, password: form.password || undefined };
        await api.put(`/accounts/${editing.id}`, body);
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
    if (!confirm('Eliminar esta cuenta?')) return;
    try { await api.delete(`/accounts/${id}`); showToast('Eliminada', 'ok'); fetchAccounts(); }
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
    setForm({ name: a.name, role: a.role, login: a.login, password: '', bridge_host: a.bridge_host, bridge_port: a.bridge_port, poll_interval: a.poll_interval, active: a.active });
    setShowForm(true);
  };

  const openNew = (role: Account['role']) => { setEditing(null); setForm({ ...emptyForm, role }); setShowForm(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">Cuentas NinjaTrader</h2><p className="text-sm text-zinc-500">{accounts.length} cuentas</p></div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => openNew('MASTER')}><Plus size={14} /> Master</Button>
          <Button variant="outline" onClick={() => openNew('SLAVE')}><Plus size={14} /> Slave</Button>
        </div>
      </div>

      {showForm && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">{editing ? 'Editar' : 'Nueva'} Cuenta</h3>
            <Button variant="ghost" size="sm" onClick={resetForm}><X size={14} /></Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Nombre</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><Label>Rol</Label><Select value={form.role} onChange={e => setForm({...form, role: e.target.value as 'MASTER'|'SLAVE'})}><option value="MASTER">MASTER</option><option value="SLAVE">SLAVE</option></Select></div>
            <div><Label>Cuenta NT8</Label><Input value={form.login||''} onChange={e => setForm({...form, login: e.target.value})} placeholder="Nombre exacto en NT8 (Sim101...)" /></div>
            <div><Label>Password (no se usa)</Label><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Bridge no requiere password" /></div>
            <div><Label>Bridge Host</Label><Input value={form.bridge_host} onChange={e => setForm({...form, bridge_host: e.target.value})} /></div>
            <div><Label>Bridge Port</Label><Input type="number" value={form.bridge_port} onChange={e => setForm({...form, bridge_port: Number(e.target.value)})} /></div>
            <div><Label>Poll Interval (s)</Label><Input type="number" step="0.1" value={form.poll_interval} onChange={e => setForm({...form, poll_interval: Number(e.target.value)})} /></div>
            <div className="flex items-end gap-2 pb-1"><Checkbox checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} /><Label>Activo</Label></div>
          </div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" onClick={resetForm}>Cancelar</Button><Button variant="primary" onClick={handleSubmit}>{editing ? 'Guardar' : 'Crear'}</Button></div>
        </Card>
      )}

      <div className="space-y-6">
        <AccountGroup
          label="Masters"
          accounts={accounts.filter(a => a.role === 'MASTER')}
          testResults={testResults}
          testing={testing}
          onTest={handleTest}
          onEdit={editAccount}
          onDelete={handleDelete}
        />
        {accounts.some(a => a.role === 'MASTER') && accounts.some(a => a.role === 'SLAVE') && (
          <div className="border-t border-zinc-800" />
        )}
        <AccountGroup
          label="Slaves"
          accounts={accounts.filter(a => a.role === 'SLAVE')}
          testResults={testResults}
          testing={testing}
          onTest={handleTest}
          onEdit={editAccount}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
