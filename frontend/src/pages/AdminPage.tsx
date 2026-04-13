import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getHealth, initIndices, listIndices, cleanup,
  rawSearch, listCommits,
} from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Panel</h2>
        <p className="text-sm text-gray-500 mt-1">Indices, health, cleanup, and operations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HealthCheckPanel />
        <IndicesManagerPanel />
        <TokenBrowserPanel />
        <CleanupPanel />
        <CommitHistoryPanel />
      </div>
    </div>
  );
}

function HealthCheckPanel() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth });
  const initMutation = useMutation({ mutationFn: initIndices });

  return (
    <Card>
      <CardHeader><CardTitle>Health Check</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-gray-500">Status:</span>
          <Badge variant={health.data?.redis_connected ? 'success' : 'danger'}>
            {health.data?.status ?? 'Loading...'}
          </Badge>
          <span className="text-gray-500">Write/Read OK:</span>
          <span>{health.data?.write_read_ok ? 'Yes' : 'No'}</span>
          <span className="text-gray-500">Modules:</span>
          <span>{health.data?.modules?.join(', ') || 'None'}</span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => initMutation.mutate()}>
          {initMutation.isPending ? 'Initializing...' : 'Initialize Indices'}
        </Button>
        {initMutation.data && <p className="text-xs text-green-600">Indices initialized</p>}
      </CardContent>
    </Card>
  );
}

function IndicesManagerPanel() {
  const indices = useQuery({ queryKey: ['indices'], queryFn: listIndices });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Indices</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => indices.refetch()}>Refresh</Button>
        </div>
      </CardHeader>
      <CardContent>
        {indices.data?.indices?.length > 0 ? (
          <div className="space-y-2">
            {indices.data.indices.map((idx: any) => (
              <div key={idx.name} className="flex items-center justify-between p-2 bg-gray-50 rounded dark:bg-gray-700">
                <span className="font-mono text-sm">{idx.name}</span>
                <Badge>{idx.num_docs} docs</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No indices</p>
        )}
      </CardContent>
    </Card>
  );
}

function TokenBrowserPanel() {
  const [indexName, setIndexName] = useState('tokens');
  const [query, setQuery] = useState('*');
  const mutation = useMutation({ mutationFn: () => rawSearch(indexName, query) });

  return (
    <Card>
      <CardHeader><CardTitle>Token / Index Browser</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Input label="Index" value={indexName} onChange={e => setIndexName(e.target.value)} />
          <Input label="Query" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Search</Button>
        {mutation.data && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Total: {mutation.data.total}</p>
            <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded max-h-60 overflow-auto">
              {JSON.stringify(mutation.data.docs, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CleanupPanel() {
  const [prefix, setPrefix] = useState('');
  const mutation = useMutation({ mutationFn: () => cleanup(prefix) });

  return (
    <Card>
      <CardHeader><CardTitle>Cleanup</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Input label="Key Prefix" placeholder="e.g. test:" value={prefix} onChange={e => setPrefix(e.target.value)} />
        <Button variant="danger" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !prefix}>
          Delete Keys
        </Button>
        {mutation.data && (
          <p className="text-xs text-green-600">Deleted {mutation.data.deleted_count} keys with prefix "{mutation.data.prefix}"</p>
        )}
      </CardContent>
    </Card>
  );
}

function CommitHistoryPanel() {
  const commits = useQuery({ queryKey: ['commits'], queryFn: listCommits });

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Commit History</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => commits.refetch()}>Refresh</Button>
        </div>
      </CardHeader>
      <CardContent>
        {commits.data?.commits?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                  <th className="pb-2">Commit ID</th>
                  <th className="pb-2">Edge Key</th>
                  <th className="pb-2">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {commits.data.commits.map((c: any) => (
                  <tr key={c.commit_id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-2 font-mono text-xs">{c.commit_id}</td>
                    <td className="py-2 font-mono text-xs">{c.edge_key}</td>
                    <td className="py-2 text-xs">{new Date(c.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No commits yet</p>
        )}
      </CardContent>
    </Card>
  );
}
