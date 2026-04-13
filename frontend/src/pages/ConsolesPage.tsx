import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { graphQuery, bitmapCommand } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Input } from '@/components/ui/Input';

export default function ConsolesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Consoles</h2>
        <p className="text-sm text-gray-500 mt-1">Execute Redis Graph queries and Roaring Bitmap commands</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GraphConsole />
        <BitmapConsole />
      </div>
    </div>
  );
}

function GraphConsole() {
  const [query, setQuery] = useState('');
  const mutation = useMutation({ mutationFn: () => graphQuery(query) });

  return (
    <Card>
      <CardHeader><CardTitle>Redis Graph Query</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          label="Cypher Query"
          value={query}
          onChange={e => setQuery(e.target.value)}
          rows={4}
          placeholder="MATCH (n) RETURN n LIMIT 10"
        />
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !query}>
          {mutation.isPending ? 'Executing...' : 'Execute'}
        </Button>
        {mutation.data && (
          <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded max-h-60 overflow-auto">
            {JSON.stringify(mutation.data.result, null, 2)}
          </pre>
        )}
        {mutation.error && <p className="text-xs text-red-500">{String(mutation.error)}</p>}
      </CardContent>
    </Card>
  );
}

function BitmapConsole() {
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const mutation = useMutation({
    mutationFn: () => bitmapCommand(command, args.split(' ').filter(Boolean)),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Roaring Bitmap Command</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Input label="Command" value={command} onChange={e => setCommand(e.target.value)} placeholder="SETBIT, GETBIT, BITCOUNT..." />
        <Input label="Arguments (space-separated)" value={args} onChange={e => setArgs(e.target.value)} placeholder="key 0 1" />
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !command}>
          {mutation.isPending ? 'Executing...' : 'Execute'}
        </Button>
        {mutation.data && (
          <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded">
            {JSON.stringify(mutation.data.result, null, 2)}
          </pre>
        )}
        {mutation.error && <p className="text-xs text-red-500">{String(mutation.error)}</p>}
      </CardContent>
    </Card>
  );
}
