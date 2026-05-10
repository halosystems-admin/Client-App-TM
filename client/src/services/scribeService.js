export async function streamScribeNote(transcript, templateId, patientId, consultationId, practiceId, onChunk, onOutputId) {
  const url = 'http://localhost:3000/api/scribe/generate';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawTranscript: transcript, templateId, patientId, consultationId, practiceId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed: ${res.status} ${res.statusText} ${text}`);
  }

  if (!res.body) {
    throw new Error('Readable stream not supported on response');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  const applyPayload = (payload) => {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    if (typeof payload.error === 'string' && payload.error.trim()) {
      throw new Error(payload.error);
    }

    if (payload.type === 'done') {
      return true;
    }

    if (payload.type === 'meta') {
      if (typeof onOutputId === 'function' && typeof payload.outputId === 'string' && payload.outputId.trim()) {
        try {
          onOutputId(payload.outputId.trim());
        } catch (e) {
          console.error('onOutputId handler threw:', e);
        }
      }
      return false;
    }

    const chunkText =
      typeof payload.text === 'string'
        ? payload.text
        : typeof payload.content === 'string'
          ? payload.content
          : '';

    if (chunkText) {
      accumulated += chunkText;
      try {
        onChunk(accumulated);
      } catch (e) {
        console.error('onChunk handler threw:', e);
      }
    }

    return false;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split on newlines, keep the last partial line in buffer
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();

      for (const rawLine of lines) {
        if (!rawLine.startsWith('data:')) continue;
        let data = rawLine.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') continue;

        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (err) {
          // skip malformed JSON chunks
          console.error('Failed to parse SSE JSON chunk:', data, err);
          continue;
        }

        if (applyPayload(parsed)) {
          return accumulated;
        }
      }
    }

    // Process any final buffered line
    if (buffer) {
      const finalLine = buffer;
      if (finalLine.startsWith('data:')) {
        let data = finalLine.slice(5).trim();
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            if (applyPayload(parsed)) {
              return accumulated;
            }
          } catch (err) {
            console.error('Failed to parse final SSE JSON chunk:', data, err);
          }
        }
      }
    }

    return accumulated;
  } finally {
    try { await reader.cancel(); } catch (e) {}
  }
}

export default streamScribeNote;
