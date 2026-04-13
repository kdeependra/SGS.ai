import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ingest, commit } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function IngestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Ingest & Commit</h2>
        <p className="text-sm text-gray-500 mt-1">Dual-token ingestion and buffer-to-persistent commit pipeline</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IngestPanel />
        <CommitPanel />
      </div>
    </div>
  );
}

function IngestPanel() {
  const [locTokens, setLocTokens] = useState('');
  const [dsTokens, setDsTokens] = useState('');
  const mutation = useMutation({
    mutationFn: () => ingest(
      locTokens.split(',').map(t => t.trim()).filter(Boolean),
      dsTokens.split(',').map(t => t.trim()).filter(Boolean),
    ),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Ingest Tokens</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Location Tokens (comma-separated)</label>
          <textarea
            value={locTokens}
            onChange={e => setLocTokens(e.target.value)}
            rows={3}
            placeholder="us, east, datacenter1"
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Dataset Tokens (comma-separated)</label>
          <textarea
            value={dsTokens}
            onChange={e => setDsTokens(e.target.value)}
            rows={3}
            placeholder="sales, revenue, q4"
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !locTokens || !dsTokens}>
          {mutation.isPending ? 'Ingesting...' : 'Ingest'}
        </Button>
        {mutation.data && (
          <div className="text-xs bg-green-50 dark:bg-green-900/30 p-2 rounded mt-2 space-y-1">
            <p>Location Key: <span className="font-mono">{mutation.data.location_key}</span></p>
            <p>Dataset Key: <span className="font-mono">{mutation.data.dataset_key}</span></p>
          </div>
        )}
        {mutation.error && <p className="text-xs text-red-500">{String(mutation.error)}</p>}
      </CardContent>
    </Card>
  );
}

function CommitPanel() {
  const [form, setForm] = useState({ location_key: '', dataset_key: '', label: 'id' });
  const mutation = useMutation({
    mutationFn: () => commit(form),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Commit (Buffer → Persistent)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Input label="Location Key (buffer)" placeholder="b:..." value={form.location_key}
          onChange={e => setForm({ ...form, location_key: e.target.value })} />
        <Input label="Dataset Key (buffer)" placeholder="b:...:..." value={form.dataset_key}
          onChange={e => setForm({ ...form, dataset_key: e.target.value })} />
        <Input label="Label" value={form.label}
          onChange={e => setForm({ ...form, label: e.target.value })} />
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.location_key || !form.dataset_key}>
          {mutation.isPending ? 'Committing...' : 'Commit'}
        </Button>
        {mutation.data && (
          <div className="text-xs bg-green-50 dark:bg-green-900/30 p-2 rounded mt-2 space-y-1">
            <p>Status: {mutation.data.status}</p>
            <p>Commit ID: <span className="font-mono">{mutation.data.commit_id}</span></p>
            <p>Edge Key: <span className="font-mono">{mutation.data.edge_key}</span></p>
            <p>Location: <span className="font-mono">{mutation.data.location_key}</span></p>
            <p>Dataset: <span className="font-mono">{mutation.data.dataset_key}</span></p>
          </div>
        )}
        {mutation.error && <p className="text-xs text-red-500">{String(mutation.error)}</p>}
      </CardContent>
    </Card>
  );
}
