/**
 * React hooks for Memory Daemon integration
 */

import { useState, useCallback } from 'react';
import {
  memoryIngest,
  memoryIngestBuffered,
  memoryIngestBufferedBatch,
  memorySearch,
  memorySummarizeDaily,
  type IngestItem,
  type SearchQuery,
  type SearchResult,
  type IngestResponse,
  type DailySummaryResponse
} from '../services/memoryDaemon';

/**
 * Hook for ingesting items into memory (unbuffered - immediate)
 * Use this when you need immediate confirmation that data was saved.
 * For high-frequency events like chat, use useMemoryIngestBuffered instead.
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { ingest, loading, error } = useMemoryIngest();
 *   
 *   const handleSave = async () => {
 *     const result = await ingest([
 *       { kind: 'note', text: 'My important note' }
 *     ]);
 *     console.log('Saved:', result);
 *   };
 * }
 * ```
 */
export function useMemoryIngest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ingest = useCallback(async (items: IngestItem[]): Promise<IngestResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await memoryIngest(items);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('Memory ingest failed:', message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveNoteQuick = useCallback(async (text: string, tags?: string[]) => {
    return ingest([{ kind: 'note', text, meta: tags ? { tags } : {}, ts: Date.now() }]);
  }, [ingest]);

  const saveChatQuick = useCallback(async (role: 'user' | 'assistant', content: string) => {
    return ingest([{
      kind: `chat:${role === 'assistant' ? 'ai' : 'user'}`,
      text: content,
      ts: Date.now()
    }]);
  }, [ingest]);

  return { ingest, saveNoteQuick, saveChatQuick, loading, error };
}

/**
 * Hook for buffered memory ingestion (recommended for chat and high-frequency events)
 * Items are queued and batched automatically (up to 64 items or 5 second timeout).
 * Non-blocking and efficient - use this for chat messages.
 * 
 * @example
 * ```tsx
 * function ChatComponent() {
 *   const { ingestBuffered } = useMemoryIngestBuffered();
 *   
 *   const handleMessage = async (msg: string) => {
 *     // Non-blocking, queued for batch processing
 *     await ingestBuffered({ kind: 'chat:user', text: msg, ts: Date.now() });
 *   };
 * }
 * ```
 */
export function useMemoryIngestBuffered() {
  const [error, setError] = useState<string | null>(null);

  const ingestBuffered = useCallback(async (item: IngestItem): Promise<void> => {
    setError(null);
    try {
      await memoryIngestBuffered(item);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('Memory buffered ingest failed:', message);
    }
  }, []);

  const ingestBufferedBatch = useCallback(async (items: IngestItem[]): Promise<void> => {
    setError(null);
    try {
      await memoryIngestBufferedBatch(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('Memory buffered batch ingest failed:', message);
    }
  }, []);

  const saveNoteBuffered = useCallback(async (text: string, tags?: string[]) => {
    return ingestBuffered({ kind: 'note', text, meta: tags ? { tags } : {}, ts: Date.now() });
  }, [ingestBuffered]);

  const saveChatBuffered = useCallback(async (role: 'user' | 'assistant', content: string) => {
    return ingestBuffered({
      kind: `chat:${role === 'assistant' ? 'ai' : 'user'}`,
      text: content,
      ts: Date.now()
    });
  }, [ingestBuffered]);

  return { ingestBuffered, ingestBufferedBatch, saveNoteBuffered, saveChatBuffered, error };
}

/**
 * Hook for searching memory
 * 
 * @example
 * ```tsx
 * function SearchComponent() {
 *   const { search, results, loading, error } = useMemorySearch();
 *   
 *   const handleSearch = async (query: string) => {
 *     await search({ query, top_k: 10 });
 *   };
 *   
 *   return (
 *     <div>
 *       {results.map(r => <div key={r.id}>{r.text}</div>)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMemorySearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: SearchQuery): Promise<SearchResult[]> => {
    setLoading(true);
    setError(null);
    try {
      const searchResults = await memorySearch(query);
      setResults(searchResults);
      return searchResults;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('Memory search failed:', message);
      setResults([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const quickSearchFn = useCallback(async (query: string, limit = 8) => {
    return search({ query, top_k: limit });
  }, [search]);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { search, quickSearch: quickSearchFn, results, loading, error, clearResults };
}

/**
 * Combined hook for both ingesting and searching
 * Uses BUFFERED ingestion by default for better performance.
 * 
 * @example
 * ```tsx
 * function MemoryComponent() {
 *   const memory = useMemory();
 *   
 *   const handleSaveAndSearch = async (text: string) => {
 *     await memory.saveNote(text);  // Buffered
 *     await memory.search({ query: text, top_k: 5 });
 *   };
 * }
 * ```
 */
export function useMemory() {
  const bufferedHook = useMemoryIngestBuffered();
  const searchHook = useMemorySearch();

  return {
    // Buffered ingest methods (recommended)
    ingestBuffered: bufferedHook.ingestBuffered,
    ingestBufferedBatch: bufferedHook.ingestBufferedBatch,
    saveNote: bufferedHook.saveNoteBuffered,
    saveChat: bufferedHook.saveChatBuffered,
    ingestError: bufferedHook.error,

    // Search methods
    search: searchHook.search,
    quickSearch: searchHook.quickSearch,
    results: searchHook.results,
    searchLoading: searchHook.loading,
    searchError: searchHook.error,
    clearResults: searchHook.clearResults,

    // Combined status
    isLoading: searchHook.loading,
    hasError: !!(bufferedHook.error || searchHook.error),
    errors: [bufferedHook.error, searchHook.error].filter(Boolean) as string[]
  };
}

/**
 * Hook for automatic chat message saving (uses BUFFERED ingestion)
 * Call this in your chat component to auto-save messages
 * Non-blocking and efficient for high-frequency events.
 * 
 * @example
 * ```tsx
 * function ChatComponent() {
 *   const { autoSaveMessage } = useMemoryAutoSave();
 *   
 *   const sendMessage = async (text: string) => {
 *     // Send to LLM
 *     const response = await callQwen(text);
 *     
 *     // Auto-save both messages to memory (buffered, non-blocking)
 *     await autoSaveMessage('user', text);
 *     await autoSaveMessage('assistant', response);
 *   };
 * }
 * ```
 */
export function useMemoryAutoSave() {
  const { ingestBuffered } = useMemoryIngestBuffered();

  const autoSaveMessage = useCallback(async (
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, any>
  ) => {
    // Save in background, don't block UI (buffered)
    ingestBuffered({
      kind: `chat:${role === 'assistant' ? 'ai' : 'user'}`,
      text: content,
      meta: metadata || {},
      ts: Date.now()
    }).catch(err => {
      console.warn('Auto-save to memory failed:', err);
    });
  }, [ingestBuffered]);

  const autoSaveNote = useCallback(async (
    text: string,
    tags?: string[]
  ) => {
    ingestBuffered({
      kind: 'note',
      text,
      meta: tags ? { tags } : {},
      ts: Date.now()
    }).catch(err => {
      console.warn('Auto-save note to memory failed:', err);
    });
  }, [ingestBuffered]);

  return { autoSaveMessage, autoSaveNote };
}

/**
 * Hook for daily summary generation
 * 
 * @example
 * ```tsx
 * function SummaryComponent() {
 *   const { generateSummary, summary, loading, error } = useDailySummary();
 *   
 *   const handleGenerate = async () => {
 *     await generateSummary(); // Today
 *     // or
 *     await generateSummary('2025-10-27'); // Specific day
 *   };
 * }
 * ```
 */
export function useDailySummary() {
  const [summary, setSummary] = useState<DailySummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSummary = useCallback(async (day?: string): Promise<DailySummaryResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await memorySummarizeDaily(day);
      setSummary(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('Daily summary generation failed:', message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSummary = useCallback(() => {
    setSummary(null);
    setError(null);
  }, []);

  return { generateSummary, summary, loading, error, clearSummary };
}
