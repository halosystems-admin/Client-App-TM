import React, { useState } from 'react';
import { streamScribeNote } from '../services/scribeService';

export default function ScribeTest() {
  const [transcript, setTranscript] = useState('Patient complains of persistent cough for 2 weeks.');
  const [noteContent, setNoteContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const TEMPLATE_ID = '77777777-7777-7777-7777-777777777777';
  const TEST_PATIENT_ID = '66666666-6666-6666-6666-666666666666';
  const TEST_CONSULTATION_ID = '55555555-5555-5555-5555-555555555555';
  const TEST_PRACTICE_ID = '44444444-4444-4444-4444-444444444444';

  const handleGenerate = async () => {
    setNoteContent('');
    setError(null);
    setIsGenerating(true);

    try {
      await streamScribeNote(transcript, TEMPLATE_ID, TEST_PATIENT_ID, TEST_CONSULTATION_ID, TEST_PRACTICE_ID, (accumulated: string) => {
        setNoteContent(accumulated);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <h3>Scribe Test</h3>

      <label style={{ display: 'block', marginBottom: 8 }}>Transcript</label>
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={4}
        style={{ width: '100%', marginBottom: 12 }}
      />

      <button onClick={handleGenerate} disabled={isGenerating}>
        {isGenerating ? 'Generating...' : 'Generate SOAP Note'}
      </button>

      {error && (
        <div style={{ color: 'red', marginTop: 12 }}>Error: {error}</div>
      )}

      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>Generated Note</label>
        <div
          style={{
            whiteSpace: 'pre-wrap',
            border: '1px solid #ddd',
            padding: 12,
            minHeight: 120,
            background: '#fafafa',
          }}
        >
          {noteContent}
        </div>
      </div>
    </div>
  );
}
