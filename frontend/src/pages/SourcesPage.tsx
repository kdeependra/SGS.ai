import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collectMysqlMetadata,
  uploadCsvMetadata,
  uploadDocumentMetadata,
  uploadCsvMetadataMulti,
  uploadDocumentMetadataMulti,
  analyzeMetadata,
  storeMetadata,
  listStoredMetadata,
  getStoredMetadata,
  deleteStoredMetadata,
  ingestMetadata,
  redisFlush,
  loadColumn,
  loadColumnsBatch,
  syncMetadataGraph,
} from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Database, FileSpreadsheet, FileText, Layers, Server, Trash2, Sparkles, Save, Archive, Eye, X, Zap, Eraser, Columns } from 'lucide-react';
import api from '@/api/client';

// ---------- Form state types ----------
type DbType = 'mysql' | 'postgresql' | 'mongodb' | 'oracle';
interface DatabaseState { dbType: DbType; host: string; port: number; user: string; password: string; database: string; table: string; schema: string; }

const DB_DEFAULTS: Record<DbType, { port: number; label: string; color: string }> = {
  mysql:      { port: 3306,  label: 'MySQL',      color: 'text-blue-600' },
  postgresql: { port: 5432,  label: 'PostgreSQL',  color: 'text-sky-600' },
  mongodb:    { port: 27017, label: 'MongoDB',     color: 'text-green-600' },
  oracle:     { port: 1521,  label: 'Oracle',      color: 'text-red-600' },
};

// ---------- MCP Status ----------
function MCPStatus() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mcp-health'],
    queryFn: () => api.get('/metadata/mcp/health').then(r => r.data),
    refetchInterval: 30000,
  });

  return (
    <div className="flex items-center gap-2 text-sm">
      <Server className="h-4 w-4" />
      <span className="text-gray-500">MCP Server:</span>
      {isLoading ? (
        <Badge>Checking…</Badge>
      ) : isError ? (
        <Badge variant="danger">Offline</Badge>
      ) : (
        <Badge variant="success">{data?.service} v{data?.version}</Badge>
      )}
    </div>
  );
}

// ---------- Single DB Connection Form ----------
function DBConnectionForm({ form, onChange, onRemove, canRemove }: {
  form: DatabaseState; onChange: (f: DatabaseState) => void; onRemove: () => void; canRemove: boolean;
}) {
  const cfg = DB_DEFAULTS[form.dbType];
  const switchDbType = (t: DbType) => onChange({ ...form, dbType: t, port: DB_DEFAULTS[t].port, schema: t === 'oracle' ? 'HR' : '' });

  return (
    <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3 relative">
      {canRemove && (
        <button onClick={onRemove} className="absolute top-2 right-2 text-red-400 hover:text-red-600" title="Remove connection">
          <X className="h-4 w-4" />
        </button>
      )}
      {/* DB Type selector */}
      <div className="flex gap-1">
        {(Object.keys(DB_DEFAULTS) as DbType[]).map(t => (
          <button key={t} onClick={() => switchDbType(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              form.dbType === t
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}>
            {DB_DEFAULTS[t].label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Host" value={form.host}
          onChange={e => onChange({ ...form, host: e.target.value })} />
        <Input label="Port" type="number" value={form.port}
          onChange={e => onChange({ ...form, port: Number(e.target.value) })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input label="User" value={form.user}
          onChange={e => onChange({ ...form, user: e.target.value })} />
        <Input label="Password" type="password" value={form.password}
          onChange={e => onChange({ ...form, password: e.target.value })} />
      </div>
      <Input label="Database" value={form.database}
        onChange={e => onChange({ ...form, database: e.target.value })} />
      {form.dbType === 'oracle' && (
        <Input label="Schema" value={form.schema}
          onChange={e => onChange({ ...form, schema: e.target.value })} />
      )}
      <Input label={`Table / Collection (optional${form.dbType === 'mongodb' ? ' — collection name' : ' — leave empty for all'})`}
        value={form.table}
        onChange={e => onChange({ ...form, table: e.target.value })} />
    </div>
  );
}

// ---------- Database Sources (multiple connections) ----------
function DatabaseSources({ forms, setForms }: { forms: DatabaseState[]; setForms: (f: DatabaseState[]) => void }) {
  const addConnection = () => setForms([...forms, { dbType: 'mysql', host: 'localhost', port: 3306, user: '', password: '', database: '', table: '', schema: '' }]);
  const updateForm = (idx: number, f: DatabaseState) => setForms(forms.map((old, i) => i === idx ? f : old));
  const removeForm = (idx: number) => setForms(forms.filter((_, i) => i !== idx));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-blue-600" />Database Connections
          <Badge>{forms.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {forms.map((form, idx) => (
          <DBConnectionForm key={idx} form={form} onChange={f => updateForm(idx, f)} onRemove={() => removeForm(idx)} canRemove={forms.length > 1} />
        ))}
        <button onClick={addConnection}
          className="w-full py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
          + Add Database Connection
        </button>
      </CardContent>
    </Card>
  );
}

// ---------- CSV Source (multi-file) ----------
function CSVSource({ files, setFiles }: { files: File[]; setFiles: (f: File[]) => void }) {
  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const arr = Array.from(newFiles);
    setFiles([...files, ...arr]);
  };
  const removeFile = (idx: number) => setFiles(files.filter((_, i) => i !== idx));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-green-600" />CSV Files
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Upload CSV(s)</label>
        <input type="file" accept=".csv" multiple
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 dark:file:bg-green-900 dark:file:text-green-300"
          onChange={e => addFiles(e.target.files)} />
        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
                <span>{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
                <button onClick={() => removeFile(i)} className="text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
              </div>
            ))}
            <p className="text-xs text-gray-400">{files.length} file(s) selected</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Document Source (multi-file) ----------
function DocumentSource({ files, setFiles }: { files: File[]; setFiles: (f: File[]) => void }) {
  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const arr = Array.from(newFiles);
    setFiles([...files, ...arr]);
  };
  const removeFile = (idx: number) => setFiles(files.filter((_, i) => i !== idx));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-purple-600" />Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Upload Document(s)</label>
        <input type="file" accept=".txt,.md,.json,.xml,.html,.yaml,.yml,.log,.rst,.docx,.pdf" multiple
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 dark:file:bg-purple-900 dark:file:text-purple-300"
          onChange={e => addFiles(e.target.files)} />
        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
                <span>{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
                <button onClick={() => removeFile(i)} className="text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
              </div>
            ))}
            <p className="text-xs text-gray-400">{files.length} file(s) selected</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Metadata Result Card ----------
function MetadataCard({ data, onRemove, onSave }: { data: any; onRemove: () => void; onSave: () => void }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!data._saved);
  const typeConfig: Record<string, { color: string; icon: typeof Database }> = {
    mysql: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: Database },
    csv: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: FileSpreadsheet },
    document: { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300', icon: FileText },
  };
  const cfg = typeConfig[data.source_type] ?? typeConfig.document;
  const Icon = cfg.icon;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      setSaved(true);
    } catch { /* parent handles error */ }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5" />
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${cfg.color}`}>
            {data.source_type.toUpperCase()}
          </span>
          {data.table || data.file_name || data.database || 'Source'}
        </CardTitle>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`p-1 rounded ${saved ? 'text-green-500' : 'text-gray-400 hover:text-indigo-500'}`}
            title={saved ? 'Saved to Redis' : 'Save to Redis'}
          >
            <Save className="h-4 w-4" />
          </button>
          <button onClick={onRemove} className="p-1 text-gray-400 hover:text-red-500 rounded">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary badges */}
        <div className="flex flex-wrap gap-2">
          {data.database && <Badge>DB: {data.database}</Badge>}
          {data.table_count != null && <Badge>Tables: {data.table_count}</Badge>}
          {data.total_rows != null && <Badge>Total Rows: {data.total_rows.toLocaleString()}</Badge>}
          {data.total_size_bytes != null && <Badge>Size: {(data.total_size_bytes / 1024).toFixed(1)} KB</Badge>}
          {data.row_count != null && <Badge>Rows: {data.row_count.toLocaleString()}</Badge>}
          {data.column_count != null && <Badge>Columns: {data.column_count}</Badge>}
          {data.columns?.length > 0 && data.column_count == null && <Badge>Columns: {data.columns.length}</Badge>}
          {data.file_size != null && <Badge>Size: {(data.file_size / 1024).toFixed(1)} KB</Badge>}
          {data.delimiter && <Badge>Delim: "{data.delimiter}"</Badge>}
          {data.doc_type && <Badge>{data.doc_type}</Badge>}
          {data.line_count != null && <Badge>Lines: {data.line_count.toLocaleString()}</Badge>}
          {data.word_count != null && <Badge>Words: {data.word_count.toLocaleString()}</Badge>}
          {data.data_length != null && !data.tables && <Badge>Data: {(data.data_length / 1024).toFixed(1)} KB</Badge>}
          {data.created_at && data.created_at !== 'None' && <Badge>Created: {data.created_at}</Badge>}
        </div>

        {/* Prompt & filter keywords */}
        {data.prompt && (
          <div className="text-sm">
            <span className="text-gray-500">Prompt:</span>{' '}
            <span className="italic text-gray-700 dark:text-gray-300">{data.prompt}</span>
            {data.filter_keywords?.length > 0 && (
              <span className="ml-2 text-xs text-gray-400">
                (matched: {data.filter_keywords.join(', ')})
              </span>
            )}
          </div>
        )}

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
                      <td className="py-1.5 pr-4 text-xs">{t.engine || '\u2014'}</td>
                      <td className="py-1.5 pr-4 text-xs">{((t.data_length || 0) / 1024).toFixed(1)} KB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Per-table column details (collapsed) */}
            {data.tables.map((t: any, ti: number) => (
              t.columns?.length > 0 && (
                <details key={ti} className="border rounded-lg dark:border-gray-700">
                  <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                    {t.table} \u2014 {t.columns.length} columns{t.foreign_keys?.length > 0 ? `, ${t.foreign_keys.length} FK(s)` : ''}
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
                            <td className="py-1 pr-3 text-xs">{c.key || '\u2014'}</td>
                            <td className="py-1 pr-3 text-xs">{c.nullable ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {t.foreign_keys?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.foreign_keys.map((fk: any, fi: number) => (
                          <span key={fi} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-50 dark:bg-yellow-900/30 text-xs text-yellow-800 dark:text-yellow-300">
                            {fk.column} \u2192 {fk.references_table}.{fk.references_column}
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
                  {data.source_type === 'mysql' && <th className="pb-2 pr-4">Key</th>}
                  {data.source_type === 'mysql' && <th className="pb-2 pr-4">Nullable</th>}
                  {data.source_type === 'csv' && <th className="pb-2 pr-4">Nulls (sample)</th>}
                  {data.source_type === 'csv' && <th className="pb-2 pr-4">Unique (sample)</th>}
                </tr>
              </thead>
              <tbody>
                {data.columns.map((c: any, i: number) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 pr-4 font-mono text-xs">{c.name}</td>
                    <td className="py-1.5 pr-4 text-xs">{c.data_type || c.inferred_type}</td>
                    {data.source_type === 'mysql' && <td className="py-1.5 pr-4 text-xs">{c.key || '—'}</td>}
                    {data.source_type === 'mysql' && <td className="py-1.5 pr-4 text-xs">{c.nullable ? 'Yes' : 'No'}</td>}
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
                  {idx.name} ({idx.column}) {idx.unique ? '✦ unique' : ''}
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

// ---------- AI Analysis Panel ----------
function AnalysisPanel({ metadata }: { metadata: any[] }) {
  const [question, setQuestion] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [usage, setUsage] = useState<{ input_tokens: number; output_tokens: number } | null>(null);

  const mutation = useMutation({
    mutationFn: () => analyzeMetadata({ prompt: question, metadata }),
    onSuccess: (data) => {
      setAnalysis(data.analysis);
      setUsage(data.usage);
    },
  });

  return (
    <Card className="border-indigo-200 dark:border-indigo-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
          <Sparkles className="h-5 w-5" /> Analyze with AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Ask a question about your collected metadata
          </label>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            rows={3}
            placeholder="e.g. What relationships exist between these tables? Write a JOIN query to combine them. What data quality issues do you see?"
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
          />
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !question.trim()}
          >
            {mutation.isPending ? 'Analyzing…' : 'Analyze with Claude'}
          </Button>
          {usage && (
            <span className="text-xs text-gray-400">
              Tokens: {usage.input_tokens} in / {usage.output_tokens} out
            </span>
          )}
        </div>
        {mutation.error && (
          <p className="text-xs text-red-500">{String(mutation.error)}</p>
        )}
        {analysis && (
          <div className="mt-4 rounded-lg bg-gray-50 dark:bg-gray-900 p-4 prose prose-sm dark:prose-invert max-w-none overflow-auto">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis) }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Simple Markdown renderer (bold, code blocks, inline code, headers, lists)
function renderMarkdown(text: string): string {
  return text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-800 text-gray-100 rounded p-3 overflow-x-auto text-xs"><code>$2</code></pre>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1 rounded text-xs">$1</code>')
    // Bullet lists
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ---------- Stored Metadata Panel ----------
function StoredMetadataPanel() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const { data: stored = [], isLoading } = useQuery({
    queryKey: ['stored-metadata'],
    queryFn: listStoredMetadata,
    refetchInterval: 15000,
  });

  const deleteMut = useMutation({
    mutationFn: (sha1: string) => deleteStoredMetadata(sha1),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stored-metadata'] }),
  });

  const loadDetail = async (sha1: string) => {
    if (expanded === sha1) { setExpanded(null); setDetail(null); return; }
    const d = await getStoredMetadata(sha1);
    setDetail(d);
    setExpanded(sha1);
  };

  const typeIcon: Record<string, typeof Database> = {
    mysql: Database, mssql: Server, csv: FileSpreadsheet, document: FileText,
  };

  if (isLoading) return <p className="text-sm text-gray-400">Loading stored metadata…</p>;
  if (stored.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-amber-600" /> Stored Metadata ({stored.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {stored.map((item: any) => {
          const Icon = typeIcon[item.source_type] ?? FileText;
          return (
            <div key={item.sha1}>
              <div className="flex items-center justify-between p-3 rounded-lg border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Icon className="h-4 w-4 text-gray-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.database || item.file_name || item.table || item.sha1.slice(0, 12)}
                    </p>
                    <div className="flex gap-2 mt-0.5">
                      <Badge>{item.source_type}</Badge>
                      {item.table_count != null && <Badge>Tables: {item.table_count}</Badge>}
                      {item.row_count != null && <Badge>Rows: {item.row_count}</Badge>}
                      {item.column_count != null && <Badge>Cols: {item.column_count}</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => loadDetail(item.sha1)} className="p-1 text-gray-400 hover:text-indigo-500" title="View details">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button onClick={() => deleteMut.mutate(item.sha1)} className="p-1 text-gray-400 hover:text-red-500" title="Delete">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {expanded === item.sha1 && detail && (
                <div className="ml-4 mt-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border dark:border-gray-700">
                  <pre className="text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap">
                    {JSON.stringify(detail, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------- Main Page ----------
export default function SourcesPage() {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');

  // Lifted form state
  const [dbForms, setDbForms] = useState<DatabaseState[]>([
    { dbType: 'mysql', host: 'localhost', port: 3306, user: '', password: '', database: '', table: '', schema: '' },
  ]);
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);

  const readyDbs = dbForms.filter(f => !!(f.user && f.database));
  const dbReady = readyDbs.length > 0;
  const csvReady = csvFiles.length > 0;
  const docReady = docFiles.length > 0;
  const anyReady = dbReady || csvReady || docReady;

  const mutation = useMutation({
    mutationFn: async () => {
      const promises: Promise<any>[] = [];
      const labels: string[] = [];

      // Queue each filled-in database connection
      for (const db of readyDbs) {
        labels.push(DB_DEFAULTS[db.dbType].label);
        promises.push(collectMysqlMetadata({
          host: db.host, port: Number(db.port), user: db.user,
          password: db.password, database: db.database, table: db.table,
          prompt, db_type: db.dbType, schema_name: db.schema,
        }));
      }
      if (csvReady) {
        if (csvFiles.length === 1) {
          labels.push('CSV');
          promises.push(uploadCsvMetadata(csvFiles[0]));
        } else {
          labels.push(`CSV (${csvFiles.length} files)`);
          promises.push(uploadCsvMetadataMulti(csvFiles));
        }
      }
      if (docReady) {
        if (docFiles.length === 1) {
          labels.push('Document');
          promises.push(uploadDocumentMetadata(docFiles[0]));
        } else {
          labels.push(`Documents (${docFiles.length} files)`);
          promises.push(uploadDocumentMetadataMulti(docFiles));
        }
      }

      const settled = await Promise.allSettled(promises);
      const successes: any[] = [];
      const failures: string[] = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          // Multi-file endpoints return arrays
          const val = r.value;
          if (Array.isArray(val)) {
            val.forEach((v: any) => successes.push({ ...v, _prompt: prompt }));
          } else {
            successes.push({ ...val, _prompt: prompt });
          }
        } else {
          failures.push(`${labels[i]}: ${String(r.reason)}`);
        }
      });
      return { successes, failures };
    },
    onSuccess: ({ successes, failures }) => {
      setResults(prev => [...prev, ...successes]);
      setErrors(failures);
    },
  });

  const removeResult = (idx: number) => setResults(prev => prev.filter((_, i) => i !== idx));

  const saveResult = async (idx: number) => {
    const data = results[idx];
    // Strip internal fields before sending
    const { _prompt, _saved, ...metadata } = data;
    await storeMetadata(metadata);
    // Mark as saved in local state
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, _saved: true } : r));
    queryClient.invalidateQueries({ queryKey: ['stored-metadata'] });
  };

  const [ingestResult, setIngestResult] = useState<any>(null);
  const ingestMut = useMutation({
    mutationFn: async () => {
      // Step 1: Clean Redis data
      await redisFlush(true);
      // Step 2: Store metadata to Redis
      for (const r of results) {
        const { _prompt, _saved, ...metadata } = r;
        await storeMetadata(metadata);
      }
      // Step 3: Ingest tokens
      const sources = results.map(({ _prompt, _saved, ...rest }) => rest);
      const ingestRes = await ingestMetadata(sources);
      // Step 4: Rebuild graph so search works immediately
      await syncMetadataGraph();
      return ingestRes;
    },
    onSuccess: (data) => {
      setIngestResult(data);
      setResults(prev => prev.map(r => ({ ...r, _saved: true })));
      queryClient.invalidateQueries({ queryKey: ['redis-stats'] });
      queryClient.invalidateQueries({ queryKey: ['stored-metadata'] });
    },
  });

  const cleanMut = useMutation({
    mutationFn: () => redisFlush(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redis-stats'] });
      queryClient.invalidateQueries({ queryKey: ['stored-metadata'] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Layers className="h-7 w-7" /> Data Sources
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Fill in the sources you want, then click the button below to collect metadata from all at once
          </p>
        </div>
        <MCPStatus />
      </div>

      {/* Prompt */}
      <Card>
        <CardContent className="py-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Prompt — describe what metadata you want to collect
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={2}
            placeholder="e.g. Show me all customer-related tables with their column types and indexes…"
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
          />
        </CardContent>
      </Card>

      {/* Three source panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DatabaseSources forms={dbForms} setForms={setDbForms} />
        <CSVSource files={csvFiles} setFiles={setCsvFiles} />
        <DocumentSource files={docFiles} setFiles={setDocFiles} />
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
          {[dbReady && `DB (${readyDbs.map(d => DB_DEFAULTS[d.dbType].label).join(', ')})`, csvReady && `CSV (${csvFiles.length})`, docReady && `Docs (${docFiles.length})`]
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

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Collected Metadata ({results.length} source{results.length > 1 ? 's' : ''})
            </h3>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => ingestMut.mutate()}
                disabled={ingestMut.isPending || cleanMut.isPending}
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Zap className="h-4 w-4" />
                {ingestMut.isPending ? 'Cleaning & Ingesting…' : 'Ingest Metadata'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { if (confirm('This will flush all Redis data. Continue?')) cleanMut.mutate(); }}
                disabled={cleanMut.isPending || ingestMut.isPending}
                className="flex items-center gap-2"
              >
                <Eraser className="h-4 w-4" />
                {cleanMut.isPending ? 'Cleaning…' : 'Clean Redis Data'}
              </Button>
              <Button variant="secondary" onClick={() => { setResults([]); setIngestResult(null); }}>Clear All</Button>
            </div>
          </div>

          {/* Ingest/Clean result */}
          {ingestMut.error && (
            <p className="text-xs text-red-500">Ingest error: {String(ingestMut.error)}</p>
          )}
          {cleanMut.error && (
            <p className="text-xs text-red-500">Clean error: {String(cleanMut.error)}</p>
          )}
          {cleanMut.isSuccess && !ingestResult && (
            <p className="text-xs text-green-600">Redis data cleaned successfully.</p>
          )}
          {ingestResult && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <Zap className="h-5 w-5" /> Ingestion Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="success">Sources: {ingestResult.sources_processed}</Badge>
                  <Badge variant="success">Tokens Ingested: {ingestResult.total_tokens_ingested}</Badge>
                  <Badge variant="success">Edges Created: {ingestResult.total_edges_created}</Badge>
                </div>
                {ingestResult.details?.map((d: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge>{d.source_type}</Badge>
                    <span className="text-gray-700 dark:text-gray-300">
                      {d.database || d.file_name || '—'}
                    </span>
                    <span className="text-gray-500">
                      {d.tokens_ingested} tokens, {d.edges_created} edges
                      {d.tables_processed != null && `, ${d.tables_processed} tables`}
                    </span>
                    {d.error && <span className="text-red-500">{d.error}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {results.map((data, idx) => (
            <MetadataCard key={idx} data={data} onRemove={() => removeResult(idx)} onSave={() => saveResult(idx)} />
          ))}

          {/* AI Analysis */}
          <AnalysisPanel metadata={results} />
        </div>
      )}

      {/* Stored Metadata */}
      <StoredMetadataPanel />

      {/* Column Loading */}
      <LoadColumnsPanel />
    </div>
  );
}

// ---------- Load Column(s) Panel ----------
function LoadColumnsPanel() {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [single, setSingle] = useState({ column_name: '', table_sha1: '', db_sha1: '', values: '', data_type: 'varchar', nullable: true });
  const [batch, setBatch] = useState({ table_sha1: '', db_sha1: '', columnsJson: '' });

  const singleMut = useMutation({
    mutationFn: () => loadColumn({
      column_name: single.column_name,
      table_sha1: single.table_sha1,
      db_sha1: single.db_sha1,
      values: single.values.split(',').map(v => v.trim()).filter(Boolean),
      data_type: single.data_type,
      nullable: single.nullable,
    }),
  });

  const batchMut = useMutation({
    mutationFn: () => {
      const cols = JSON.parse(batch.columnsJson);
      const mapped = cols.map((c: any) => ({
        column_name: c.column_name,
        table_sha1: batch.table_sha1 || c.table_sha1,
        db_sha1: batch.db_sha1 || c.db_sha1,
        values: c.values || [],
        data_type: c.data_type || 'varchar',
        nullable: c.nullable ?? true,
      }));
      return loadColumnsBatch(mapped);
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Columns className="h-5 w-5 text-violet-600" /> Load Column with HLLSet
          </CardTitle>
          <div className="flex gap-1">
            <Button variant={mode === 'single' ? 'primary' : 'ghost'} size="sm" onClick={() => setMode('single')}>Single</Button>
            <Button variant={mode === 'batch' ? 'primary' : 'ghost'} size="sm" onClick={() => setMode('batch')}>Batch</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {mode === 'single' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Column Name" value={single.column_name}
                onChange={e => setSingle({ ...single, column_name: e.target.value })} />
              <Input label="Data Type" value={single.data_type}
                onChange={e => setSingle({ ...single, data_type: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Table SHA1" value={single.table_sha1}
                onChange={e => setSingle({ ...single, table_sha1: e.target.value })} placeholder="SHA1 of parent table" />
              <Input label="DB SHA1" value={single.db_sha1}
                onChange={e => setSingle({ ...single, db_sha1: e.target.value })} placeholder="SHA1 of parent database" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Values (comma-separated)</label>
              <textarea
                value={single.values}
                onChange={e => setSingle({ ...single, values: e.target.value })}
                rows={2}
                placeholder="alice@test.com, bob@test.com, carol@test.com"
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={single.nullable} onChange={e => setSingle({ ...single, nullable: e.target.checked })} />
              Nullable
            </label>
            <Button onClick={() => singleMut.mutate()} disabled={singleMut.isPending || !single.column_name || !single.table_sha1}>
              {singleMut.isPending ? 'Loading…' : 'Load Column'}
            </Button>
            {singleMut.data && (
              <div className="p-2 bg-green-50 dark:bg-green-900/30 rounded text-xs space-y-1">
                <p className="font-semibold text-green-700 dark:text-green-300">Column loaded</p>
                <p className="font-mono text-gray-600 dark:text-gray-400">SHA1: {singleMut.data.sha1}</p>
                <p>Cardinality: {singleMut.data.cardinality}</p>
              </div>
            )}
            {singleMut.error && <p className="text-xs text-red-500">{String(singleMut.error)}</p>}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Table SHA1 (shared)" value={batch.table_sha1}
                onChange={e => setBatch({ ...batch, table_sha1: e.target.value })} placeholder="SHA1 of parent table" />
              <Input label="DB SHA1 (shared)" value={batch.db_sha1}
                onChange={e => setBatch({ ...batch, db_sha1: e.target.value })} placeholder="SHA1 of parent database" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Columns JSON</label>
              <textarea
                value={batch.columnsJson}
                onChange={e => setBatch({ ...batch, columnsJson: e.target.value })}
                rows={5}
                placeholder={'[\n  {"column_name": "email", "values": ["a@b.com","c@d.com"], "data_type": "varchar"},\n  {"column_name": "age", "values": ["25","30"], "data_type": "int"}\n]'}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-mono shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <Button onClick={() => batchMut.mutate()} disabled={batchMut.isPending || !batch.columnsJson}>
              {batchMut.isPending ? 'Loading…' : 'Load Batch'}
            </Button>
            {batchMut.data?.columns && (
              <div className="p-2 bg-green-50 dark:bg-green-900/30 rounded text-xs space-y-1">
                <p className="font-semibold text-green-700 dark:text-green-300">{batchMut.data.columns.length} column(s) loaded</p>
                {batchMut.data.columns.map((c: any) => (
                  <p key={c.sha1} className="font-mono text-gray-600 dark:text-gray-400">{c.column_name}: {c.sha1?.slice(0, 12)}… (cardinality: {c.cardinality})</p>
                ))}
              </div>
            )}
            {batchMut.error && <p className="text-xs text-red-500">{String(batchMut.error)}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
