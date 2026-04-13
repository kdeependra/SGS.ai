import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  collectMysqlMetadata,
  collectMssqlMetadata,
  uploadCsvMetadata,
  uploadDocumentMetadata,
  storeMetadata,
  syncMetadataGraph,
} from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Database, FileSpreadsheet, FileText, Layers, Server, ChevronDown, ChevronRight, Save, RefreshCw } from 'lucide-react';

// ---- Form state types ----
interface MySQLState { host: string; port: number; user: string; password: string; database: string; table: string; }
interface MSSQLState { host: string; port: number; user: string; password: string; database: string; table: string; schema_name: string; }

// ---- MySQL Form ----
function MySQLForm({ form, setForm }: { form: MySQLState; setForm: (f: MySQLState) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Host" value={form.host}
          onChange={e => setForm({ ...form, host: e.target.value })} />
        <Input placeholder="Port" type="number" value={form.port}
          onChange={e => setForm({ ...form, port: Number(e.target.value) })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="User" value={form.user}
          onChange={e => setForm({ ...form, user: e.target.value })} />
        <Input placeholder="Password" type="password" value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })} />
      </div>
      <Input placeholder="Database" value={form.database}
        onChange={e => setForm({ ...form, database: e.target.value })} />
      <Input placeholder="Table" value={form.table}
        onChange={e => setForm({ ...form, table: e.target.value })} />
    </div>
  );
}

// ---- MSSQL Form ----
function MSSQLForm({ form, setForm }: { form: MSSQLState; setForm: (f: MSSQLState) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Host" value={form.host}
          onChange={e => setForm({ ...form, host: e.target.value })} />
        <Input placeholder="Port" type="number" value={form.port}
          onChange={e => setForm({ ...form, port: Number(e.target.value) })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="User" value={form.user}
          onChange={e => setForm({ ...form, user: e.target.value })} />
        <Input placeholder="Password" type="password" value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Database" value={form.database}
          onChange={e => setForm({ ...form, database: e.target.value })} />
        <Input placeholder="Schema" value={form.schema_name}
          onChange={e => setForm({ ...form, schema_name: e.target.value })} />
      </div>
      <Input placeholder="Table" value={form.table}
        onChange={e => setForm({ ...form, table: e.target.value })} />
    </div>
  );
}

// ---- CSV Upload Form ----
function CSVForm({ file, setFile }: { file: File | null; setFile: (f: File | null) => void }) {
  return (
    <div className="space-y-3">
      <input type="file" accept=".csv"
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        onChange={e => setFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}

// ---- Document Upload Form ----
function DocumentForm({ file, setFile }: { file: File | null; setFile: (f: File | null) => void }) {
  return (
    <div className="space-y-3">
      <input type="file" accept=".txt,.md,.json,.xml,.html,.yaml,.yml,.log,.rst,.docx,.pdf"
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        onChange={e => setFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}

// ---- Metadata Result Display ----
function MetadataResult({ data, onRemove }: { data: any; onRemove: () => void }) {
  const typeColor: Record<string, string> = {
    mysql: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    mssql: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    csv: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    document: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${typeColor[data.source_type] ?? ''}`}>
            {data.source_type.toUpperCase()}
          </span>
          {data.file_name || data.table || data.database || 'Source'}
        </CardTitle>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="flex flex-wrap gap-3">
          {data.table_count != null && <Badge>Tables: {data.table_count}</Badge>}
          {data.total_rows != null && <Badge>Total Rows: {data.total_rows.toLocaleString()}</Badge>}
          {data.total_size_bytes != null && <Badge>Size: {(data.total_size_bytes / 1024).toFixed(1)} KB</Badge>}
          {data.row_count != null && <Badge>Rows: {data.row_count.toLocaleString()}</Badge>}
          {data.column_count != null && <Badge>Columns: {data.column_count}</Badge>}
          {data.columns?.length > 0 && data.column_count == null && <Badge>Columns: {data.columns.length}</Badge>}
          {data.file_size != null && <Badge>Size: {(data.file_size / 1024).toFixed(1)} KB</Badge>}
          {data.line_count != null && <Badge>Lines: {data.line_count.toLocaleString()}</Badge>}
          {data.word_count != null && <Badge>Words: {data.word_count.toLocaleString()}</Badge>}
          {data.doc_type && <Badge>{data.doc_type}</Badge>}
          {data.delimiter && <Badge>Delim: "{data.delimiter}"</Badge>}
          {data.database && <Badge>DB: {data.database}</Badge>}
        </div>

        {/* Database-level tables overview */}
        {data.tables?.length > 0 && !data.table && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tables</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                    <th className="pb-2 pr-4">Table</th>
                    <th className="pb-2 pr-4">Rows</th>
                    <th className="pb-2 pr-4">Columns</th>
                    <th className="pb-2 pr-4">FKs</th>
                    <th className="pb-2 pr-4">Engine</th>
                    <th className="pb-2 pr-4">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tables.map((t: any, i: number) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-1.5 pr-4 font-mono text-xs font-semibold">{t.table}</td>
                      <td className="py-1.5 pr-4 text-xs">{(t.row_count ?? 0).toLocaleString()}</td>
                      <td className="py-1.5 pr-4 text-xs">{t.column_count ?? t.columns?.length ?? 0}</td>
                      <td className="py-1.5 pr-4 text-xs">{t.foreign_keys?.length ?? 0}</td>
                      <td className="py-1.5 pr-4 text-xs">{t.engine || '—'}</td>
                      <td className="py-1.5 pr-4 text-xs">{((t.data_length || 0) / 1024).toFixed(1)} KB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Column details per table (collapsed) */}
            {data.tables.map((t: any, ti: number) => (
              t.columns?.length > 0 && (
                <details key={ti} className="border rounded-lg dark:border-gray-700">
                  <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                    {t.table} — {t.columns.length} columns{t.foreign_keys?.length > 0 ? `, ${t.foreign_keys.length} FK(s)` : ''}
                  </summary>
                  <div className="px-3 pb-3">
                    <table className="w-full text-sm mt-1">
                      <thead>
                        <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                          <th className="pb-1 pr-3 text-xs">Column</th>
                          <th className="pb-1 pr-3 text-xs">Type</th>
                          <th className="pb-1 pr-3 text-xs">Key</th>
                          <th className="pb-1 pr-3 text-xs">Nullable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.columns.map((c: any, ci: number) => (
                          <tr key={ci} className="border-t border-gray-50 dark:border-gray-800">
                            <td className="py-1 pr-3 font-mono text-xs">{c.name}</td>
                            <td className="py-1 pr-3 text-xs">{c.data_type}</td>
                            <td className="py-1 pr-3 text-xs">{c.key || '—'}</td>
                            <td className="py-1 pr-3 text-xs">{c.nullable ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {t.foreign_keys?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.foreign_keys.map((fk: any, fi: number) => (
                          <span key={fi} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-50 dark:bg-yellow-900/30 text-xs text-yellow-800 dark:text-yellow-300">
                            {fk.column} → {fk.references_table}.{fk.references_column}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              )
            ))}
          </div>
        )}

        {/* Columns table */}
        {data.columns?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                  <th className="pb-2 pr-4">Column</th>
                  <th className="pb-2 pr-4">Type</th>
                  {(data.source_type === 'mysql' || data.source_type === 'mssql') && <th className="pb-2 pr-4">Key</th>}
                  {(data.source_type === 'mysql' || data.source_type === 'mssql') && <th className="pb-2 pr-4">Nullable</th>}
                  {data.source_type === 'csv' && <th className="pb-2 pr-4">Nulls</th>}
                  {data.source_type === 'csv' && <th className="pb-2 pr-4">Unique</th>}
                </tr>
              </thead>
              <tbody>
                {data.columns.map((c: any, i: number) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 pr-4 font-mono text-xs">{c.name}</td>
                    <td className="py-1.5 pr-4 text-xs">{c.data_type || c.inferred_type}</td>
                    {(data.source_type === 'mysql' || data.source_type === 'mssql') && <td className="py-1.5 pr-4 text-xs">{c.key || '—'}</td>}
                    {(data.source_type === 'mysql' || data.source_type === 'mssql') && <td className="py-1.5 pr-4 text-xs">{c.nullable ? 'Yes' : 'No'}</td>}
                    {data.source_type === 'csv' && <td className="py-1.5 pr-4 text-xs">{c.null_count_sample}</td>}
                    {data.source_type === 'csv' && <td className="py-1.5 pr-4 text-xs">{c.unique_count_sample}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Indexes (MySQL) */}
        {data.indexes?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Indexes</h4>
            <div className="flex flex-wrap gap-2">
              {data.indexes.map((idx: any, i: number) => (
                <Badge key={i} variant={idx.unique ? 'success' : 'default'}>
                  {idx.name} ({idx.column})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Document structure */}
        {data.structure && Object.keys(data.structure).length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Structure</h4>
            <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-auto max-h-48">
              {JSON.stringify(data.structure, null, 2)}
            </pre>
          </div>
        )}

        {/* Top words (Document) */}
        {data.top_words && Object.keys(data.top_words).length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Top Words</h4>
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.top_words).slice(0, 15).map(([word, count]) => (
                <span key={word}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs">
                  {word} <span className="text-gray-400">{String(count)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Main Page ----
export default function MetadataPage() {
  const [results, setResults] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  // Source toggles
  const [mysqlEnabled, setMysqlEnabled] = useState(false);
  const [mssqlEnabled, setMssqlEnabled] = useState(false);
  const [csvEnabled, setCsvEnabled] = useState(false);
  const [docEnabled, setDocEnabled] = useState(false);

  // Lifted form state
  const [mysqlForm, setMysqlForm] = useState<MySQLState>({
    host: 'localhost', port: 3306, user: '', password: '', database: '', table: '',
  });
  const [mssqlForm, setMssqlForm] = useState<MSSQLState>({
    host: 'localhost', port: 1433, user: '', password: '', database: '', table: '', schema_name: 'dbo',
  });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  const mysqlReady = mysqlEnabled && !!(mysqlForm.user && mysqlForm.database);
  const mssqlReady = mssqlEnabled && !!(mssqlForm.user && mssqlForm.database && mssqlForm.table);
  const csvReady = csvEnabled && !!csvFile;
  const docReady = docEnabled && !!docFile;
  const anyReady = mysqlReady || mssqlReady || csvReady || docReady;

  const mutation = useMutation({
    mutationFn: async () => {
      const promises: Promise<any>[] = [];
      const labels: string[] = [];

      if (mysqlReady) {
        labels.push('MySQL');
        promises.push(collectMysqlMetadata({ ...mysqlForm, port: Number(mysqlForm.port) }));
      }
      if (mssqlReady) {
        labels.push('MSSQL');
        promises.push(collectMssqlMetadata({ ...mssqlForm, port: Number(mssqlForm.port) }));
      }
      if (csvReady) {
        labels.push('CSV');
        promises.push(uploadCsvMetadata(csvFile!));
      }
      if (docReady) {
        labels.push('Document');
        promises.push(uploadDocumentMetadata(docFile!));
      }

      const settled = await Promise.allSettled(promises);
      const successes: any[] = [];
      const failures: string[] = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') successes.push(r.value);
        else failures.push(`${labels[i]}: ${String(r.reason)}`);
      });
      return { successes, failures };
    },
    onSuccess: ({ successes, failures }) => {
      setResults(prev => [...prev, ...successes]);
      setErrors(failures);
    },
  });

  const addResult = (data: any) => setResults(prev => [...prev, data]);
  const removeResult = (idx: number) => setResults(prev => prev.filter((_, i) => i !== idx));

  const [syncStatus, setSyncStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const saveSyncMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Store each collected metadata into Redis
      for (const r of results) {
        await storeMetadata(r);
      }
      // Step 2: Sync Redis hashes into RedisGraph
      const syncResult = await syncMetadataGraph();
      return syncResult;
    },
    onSuccess: (data) => {
      setSyncStatus({
        message: `Saved ${results.length} source(s) to Redis and synced graph: ${data.nodes_created} nodes, ${data.edges_created} edges created`,
        type: 'success',
      });
    },
    onError: (err: any) => {
      setSyncStatus({
        message: `Save & sync failed: ${err?.message || String(err)}`,
        type: 'error',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Layers className="h-7 w-7" /> Metadata Collection
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Fill in the sources you want, then click the button below to collect metadata from all at once
        </p>
      </div>

      {/* Input forms — each source is collapsible */}
      <div className="space-y-4">
        {/* MySQL */}
        <div className="border rounded-lg dark:border-gray-700">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
            onClick={() => setMysqlEnabled(v => !v)}
          >
            <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <Database className="h-5 w-5" /> MySQL Table
            </span>
            {mysqlEnabled ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
          </button>
          {mysqlEnabled && (
            <div className="px-4 pb-4">
              <MySQLForm form={mysqlForm} setForm={setMysqlForm} />
            </div>
          )}
        </div>

        {/* MSSQL */}
        <div className="border rounded-lg dark:border-gray-700">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
            onClick={() => setMssqlEnabled(v => !v)}
          >
            <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <Server className="h-5 w-5" /> SQL Server Table
            </span>
            {mssqlEnabled ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
          </button>
          {mssqlEnabled && (
            <div className="px-4 pb-4">
              <MSSQLForm form={mssqlForm} setForm={setMssqlForm} />
            </div>
          )}
        </div>

        {/* CSV */}
        <div className="border rounded-lg dark:border-gray-700">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
            onClick={() => setCsvEnabled(v => !v)}
          >
            <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <FileSpreadsheet className="h-5 w-5" /> CSV File
            </span>
            {csvEnabled ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
          </button>
          {csvEnabled && (
            <div className="px-4 pb-4">
              <CSVForm file={csvFile} setFile={setCsvFile} />
            </div>
          )}
        </div>

        {/* Document */}
        <div className="border rounded-lg dark:border-gray-700">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
            onClick={() => setDocEnabled(v => !v)}
          >
            <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <FileText className="h-5 w-5" /> Document
            </span>
            {docEnabled ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
          </button>
          {docEnabled && (
            <div className="px-4 pb-4">
              <DocumentForm file={docFile} setFile={setDocFile} />
            </div>
          )}
        </div>
      </div>

      {/* Single collect button */}
      <div className="flex items-center gap-4">
        <Button
          className="px-8 py-3 text-base"
          onClick={() => { setErrors([]); mutation.mutate(); }}
          disabled={mutation.isPending || !anyReady}
        >
          {mutation.isPending ? 'Collecting…' : 'Collect All Metadata'}
        </Button>
        <span className="text-sm text-gray-500">
          {[mysqlReady && 'MySQL', mssqlReady && 'MSSQL', csvReady && 'CSV', docReady && 'Document']
            .filter(Boolean).join(', ') || 'Fill in at least one source'}
        </span>
      </div>
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-red-500">{err}</p>
          ))}
        </div>
      )}

      {/* Combined results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Collected Metadata ({results.length} source{results.length > 1 ? 's' : ''})
            </h3>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => { setSyncStatus(null); saveSyncMutation.mutate(); }}
                disabled={saveSyncMutation.isPending}
                className="flex items-center gap-2"
              >
                {saveSyncMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saveSyncMutation.isPending ? 'Saving & Syncing…' : 'Save to Redis & Sync Graph'}
              </Button>
              <Button variant="secondary" onClick={() => setResults([])}>Clear All</Button>
            </div>
          </div>

          {syncStatus && (
            <div className={`p-3 rounded-lg text-sm border ${
              syncStatus.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
            }`}>
              {syncStatus.message}
            </div>
          )}

          {results.map((data, idx) => (
            <MetadataResult key={idx} data={data} onRemove={() => removeResult(idx)} />
          ))}
        </div>
      )}
    </div>
  );
}
