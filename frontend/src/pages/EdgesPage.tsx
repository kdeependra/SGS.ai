import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createEdge, searchEdges, archiveEdges, findSimilarColumns } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

export default function EdgesPage() {
  const [state, setState] = useState('head');
  const edges = useQuery({ queryKey: ['edges', state], queryFn: () => searchEdges(state) });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edge Explorer</h2>
        <p className="text-sm text-gray-500 mt-1">Manage entity relationships and explore similarity</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CreateEdgeForm />
        <ArchiveEdgesForm />
        <SimilarColumnsPanel />
      </div>

      {/* Edge Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Edges</CardTitle>
            <div className="flex gap-2">
              {['head', 'tail', 'all'].map(s => (
                <Button key={s} variant={state === s ? 'primary' : 'ghost'} size="sm" onClick={() => setState(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {edges.data?.edges?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                    <th className="pb-2">Label</th>
                    <th className="pb-2">Left</th>
                    <th className="pb-2">Right</th>
                    <th className="pb-2">State</th>
                    <th className="pb-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {edges.data.edges.map((e: any) => (
                    <tr key={e.key} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-2">{e.label}</td>
                      <td className="py-2 font-mono text-xs">{e.left}</td>
                      <td className="py-2 font-mono text-xs">{e.right}</td>
                      <td className="py-2"><Badge variant={e.state === 'head' ? 'success' : 'default'}>{e.state}</Badge></td>
                      <td className="py-2 text-xs">{e.timestamp ? new Date(e.timestamp).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No edges found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateEdgeForm() {
  const [form, setForm] = useState({ left: '', right: '', label: 'id' });
  const mutation = useMutation({ mutationFn: () => createEdge(form) });

  return (
    <Card>
      <CardHeader><CardTitle>Create Edge</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Input label="Left (SHA1)" value={form.left} onChange={e => setForm({ ...form, left: e.target.value })} />
        <Input label="Right (SHA1)" value={form.right} onChange={e => setForm({ ...form, right: e.target.value })} />
        <Input label="Label" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.left || !form.right}>Create</Button>
        {mutation.data && <p className="text-xs text-green-600 font-mono mt-2">Key: {mutation.data.key}</p>}
      </CardContent>
    </Card>
  );
}

function ArchiveEdgesForm() {
  const [sha1, setSha1] = useState('');
  const mutation = useMutation({ mutationFn: () => archiveEdges(sha1) });

  return (
    <Card>
      <CardHeader><CardTitle>Archive Edges</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Input label="Entity SHA1" value={sha1} onChange={e => setSha1(e.target.value)} />
        <Button variant="secondary" onClick={() => mutation.mutate()} disabled={mutation.isPending || !sha1}>
          Archive
        </Button>
        {mutation.data && <p className="text-xs text-green-600 mt-2">Archived: {mutation.data.archived_count}</p>}
      </CardContent>
    </Card>
  );
}

function SimilarColumnsPanel() {
  const [sha1, setSha1] = useState('');
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['similar', sha1],
    queryFn: () => findSimilarColumns(sha1),
    enabled: false,
  });

  return (
    <Card className="lg:col-span-2">
      <CardHeader><CardTitle>Column Similarity (Jaccard via HLLSet)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Column SHA1..." value={sha1} onChange={e => setSha1(e.target.value)} className="flex-1" />
          <Button onClick={() => refetch()} disabled={isFetching || !sha1}>Find Similar</Button>
        </div>
        {data?.length > 0 && (
          <div className="space-y-2">
            {data.map((r: any) => (
              <div key={r.sha1} className="flex items-center justify-between p-2 bg-gray-50 rounded dark:bg-gray-700">
                <div>
                  <p className="text-sm font-medium">{r.column_name}</p>
                  <p className="text-xs text-gray-500 font-mono">{r.sha1}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2 dark:bg-gray-600">
                    <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${Math.round(r.jaccard * 100)}%` }} />
                  </div>
                  <span className="text-sm font-medium">{(r.jaccard * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
