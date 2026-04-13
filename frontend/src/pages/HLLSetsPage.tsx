import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { storeHllset, retrieveHllset, hllsetOperation } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

export default function HLLSetsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">HLLSet Explorer</h2>
        <p className="text-sm text-gray-500 mt-1">Store, retrieve, and perform set operations on HLLSets</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StorePanel />
        <RetrievePanel />
        <OperationPanel />
      </div>
    </div>
  );
}

function StorePanel() {
  const [key, setKey] = useState('');
  const [valuesRaw, setValuesRaw] = useState('');
  const mutation = useMutation({
    mutationFn: () => storeHllset(key, valuesRaw.split('\n').map(v => v.trim()).filter(Boolean)),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Store HLLSet</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Input label="Key" value={key} onChange={e => setKey(e.target.value)} />
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Values (one per line)</label>
          <textarea
            value={valuesRaw}
            onChange={e => setValuesRaw(e.target.value)}
            rows={4}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !key}>Store</Button>
        {mutation.data && (
          <p className="text-xs text-green-600">Stored. Cardinality: {mutation.data.cardinality}</p>
        )}
      </CardContent>
    </Card>
  );
}

function RetrievePanel() {
  const [key, setKey] = useState('');
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['hllset', key],
    queryFn: () => retrieveHllset(key),
    enabled: false,
  });

  return (
    <Card>
      <CardHeader><CardTitle>Retrieve HLLSet</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Key..." value={key} onChange={e => setKey(e.target.value)} className="flex-1" />
          <Button onClick={() => refetch()} disabled={isFetching || !key}>Retrieve</Button>
        </div>
        {data && (
          <div className="text-sm space-y-1">
            <p>Exists: <Badge variant={data.exists ? 'success' : 'danger'}>{data.exists ? 'Yes' : 'No'}</Badge></p>
            <p>Cardinality: <span className="font-bold">{data.cardinality}</span></p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OperationPanel() {
  const [form, setForm] = useState({ operation: 'union', key1: '', key2: '', result_key: '' });
  const mutation = useMutation({
    mutationFn: () => hllsetOperation(form.operation, [form.key1, form.key2], form.result_key),
  });

  return (
    <Card className="lg:col-span-2">
      <CardHeader><CardTitle>Set Operation</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {['union', 'intersection', 'difference'].map(op => (
            <Button key={op} variant={form.operation === op ? 'primary' : 'ghost'} size="sm"
              onClick={() => setForm({ ...form, operation: op })}>
              {op}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Source Key 1" value={form.key1} onChange={e => setForm({ ...form, key1: e.target.value })} />
          <Input label="Source Key 2" value={form.key2} onChange={e => setForm({ ...form, key2: e.target.value })} />
          <Input label="Result Key" value={form.result_key} onChange={e => setForm({ ...form, result_key: e.target.value })} />
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.key1 || !form.key2 || !form.result_key}>
          Execute
        </Button>
        {mutation.data && (
          <p className="text-xs text-green-600">
            Result stored in <span className="font-mono">{mutation.data.result_key}</span> — Cardinality: {mutation.data.cardinality}
          </p>
        )}
        {mutation.error && <p className="text-xs text-red-500">{String(mutation.error)}</p>}
      </CardContent>
    </Card>
  );
}
