/**
 * Example React component showing Memory Daemon integration
 * 
 * This demonstrates all the main features:
 * - Saving notes and chat messages
 * - Searching memory with semantic similarity
 * - Displaying results
 */

import { useState } from 'react';
import { useMemory } from '../hooks/useMemory';

export function MemoryExample() {
  const memory = useMemory();
  const [noteText, setNoteText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    
    await memory.saveNote(noteText);
    console.log('Note saved successfully');
    setNoteText('');
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    await memory.search({ query: searchQuery, top_k: 8 });
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Memory Daemon Example</h2>

      {/* Save Note Section */}
      <section style={{ marginBottom: '30px' }}>
        <h3>Save a Note</h3>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Enter your note..."
          rows={4}
          style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
        />
        <button 
          onClick={handleSaveNote}
          disabled={memory.isLoading || !noteText.trim()}
          style={{ padding: '10px 20px' }}
        >
          {memory.isLoading ? 'Saving...' : 'Save Note'}
        </button>
        {memory.errors.length > 0 && (
          <div style={{ color: 'red', marginTop: '10px' }}>
            Error: {memory.errors[memory.errors.length - 1]}
          </div>
        )}
      </section>

      {/* Search Section */}
      <section style={{ marginBottom: '30px' }}>
        <h3>Search Memory</h3>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for similar content..."
          style={{ width: '70%', padding: '10px', marginRight: '10px' }}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button 
          onClick={handleSearch}
          disabled={memory.isLoading || !searchQuery.trim()}
          style={{ padding: '10px 20px' }}
        >
          {memory.isLoading ? 'Searching...' : 'Search'}
        </button>
        {memory.errors.length > 0 && (
          <div style={{ color: 'red', marginTop: '10px' }}>
            Error: {memory.errors[memory.errors.length - 1]}
          </div>
        )}
      </section>

      {/* Results Section */}
      <section>
        <h3>Results ({memory.results.length})</h3>
        {memory.results.length === 0 ? (
          <p style={{ color: '#666' }}>No results yet. Try searching for something!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {memory.results.map((result) => (
              <div
                key={result.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '15px',
                  backgroundColor: '#f9f9f9'
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                  fontSize: '12px',
                  color: '#666'
                }}>
                  <span>
                    <strong>Type:</strong> {result.kind} | 
                    <strong> ID:</strong> {result.id}
                  </span>
                  <span>
                    <strong>Similarity:</strong> {(1 - result.distance).toFixed(3)}
                  </span>
                </div>
                <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
                  {result.text}
                </div>
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '11px', 
                  color: '#999' 
                }}>
                  {new Date(result.ts).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Status */}
      {memory.isLoading && (
        <div style={{ 
          position: 'fixed', 
          bottom: '20px', 
          right: '20px',
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          borderRadius: '5px'
        }}>
          Processing...
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Usage in your App.tsx or main component
// ============================================================================

/*
import { MemoryExample } from './components/MemoryExample';

function App() {
  return (
    <div>
      <h1>My App</h1>
      <MemoryExample />
    </div>
  );
}
*/

// ============================================================================
// Auto-saving chat messages example
// ============================================================================

/*
import { useMemoryAutoSave } from '../hooks/useMemory';

function ChatComponent() {
  const { autoSaveMessage } = useMemoryAutoSave();
  const [message, setMessage] = useState('');

  const sendMessage = async () => {
    // Save user message
    await autoSaveMessage('user', message);
    
    // Call your LLM (existing call_qwen)
    const response = await invoke('call_qwen', { 
      input: { message } 
    });
    
    // Save AI response
    await autoSaveMessage('assistant', response);
  };

  return (
    // Your chat UI
  );
}
*/
