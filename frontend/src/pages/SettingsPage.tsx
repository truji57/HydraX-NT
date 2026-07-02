import { useEffect, useRef, useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useStore } from '../store';
import { Download, Upload } from 'lucide-react';

interface ChangelogEntry {
  version: string;
  date: string;
  description: string;
}

export default function SettingsPage() {
  const { copierStatus, version, showToast } = useStore();
  const [importing, setImporting] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/system/changelog')
      .then(r => r.json())
      .then(setChangelog)
      .catch(() => {});
  }, []);

  const handleExport = async () => {
    try {
      const resp = await fetch('/api/system/backup/export');
      const data = await resp.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `hydrax-nt-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
      showToast('Backup exportado', 'ok');
    } catch { showToast('Error al exportar', 'error'); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const resp = await fetch('/api/system/backup/import', { method: 'POST', body: fd });
      const data = await resp.json();
      if (data.ok) { showToast(data.message, 'ok'); useStore.getState().fetchAccounts(); }
      else showToast(data.error || 'Error', 'error');
    } catch { showToast('Error', 'error'); }
    setImporting(false);
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-white">Ajustes</h2><p className="text-sm text-zinc-500">Configuracion global</p></div>
      <div className="grid grid-cols-2 gap-6">
        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-medium text-white">Informacion</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-zinc-400">Version</span><span className="text-white">{version || '...'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Backend</span><span className="text-emerald-400">http://localhost:8005</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Frontend</span><span className="text-emerald-400">http://localhost:5173</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">API Docs</span><a href="http://localhost:8005/docs" target="_blank" className="text-blue-400 hover:underline">Swagger UI</a></div>
          </div>
        </Card>
        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-medium text-white">Backup y Restauracion</h3>
          <p className="text-xs text-zinc-500">Exporta/importa toda la configuracion (cuentas, slaves, etc).</p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleExport}><Download size={14} /> Exportar</Button>
            <Button variant="outline" size="sm" disabled={importing} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> {importing ? 'Importando...' : 'Importar'}</Button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          </div>
        </Card>
        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-medium text-white">Estado del Copiador</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-zinc-400">Estado</span><span className={copierStatus.running ? 'text-emerald-400' : 'text-red-400'}>{copierStatus.running ? 'Activo' : 'Detenido'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Masters</span><span className="text-white">{copierStatus.active_masters}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Slaves</span><span className="text-white">{copierStatus.active_slaves}</span></div>
          </div>
        </Card>
      </div>
      {changelog.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-white mb-3">Historial de Versiones</h3>
          <div className="space-y-2 text-xs max-h-96 overflow-auto">
            {changelog.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5 px-1 hover:bg-zinc-800/30 rounded">
                <span className="text-emerald-400 font-medium shrink-0 w-14">{entry.version}</span>
                <span className="text-zinc-600 shrink-0 w-20">{entry.date}</span>
                <span className="text-zinc-400">{entry.description}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
