/**
 * Streams the scribe generation output.
 * @param {string} transcript - The raw transcript text.
 * @param {string} templateId - The ID of the template to use.
 * @param {string} patientId - The patient ID.
 * @param {string} consultationId - The consultation ID.
 * @param {string} practiceId - The practice ID.
 * @param {function} onChunk - Callback for each stream chunk (text content).
 * @param {function} onOutputId - Callback when the backend sends the output ID.
 */
export async function streamScribeNote(
  transcript, 
  templateId, 
  patientId, 
  consultationId, 
  practiceId, 
  onChunk, 
  onOutputId
) {
  const url = 'http://localhost:3000/api/scribe/generate';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // CRITICAL: This allows the browser to send your connect.sid cookie
    credentials: 'include', 
    body: JSON.stringify({ 
      rawTranscript: transcript, 
      templateId, 
      patientId, 
      consultationId, 
      practiceId 
    }),
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
  let eventData = [];

  const emitChunk = (text) => {
    if (typeof text === 'string' && text.length > 0) {
      onChunk(text);
    }
  };

  const flushEvent = () => {
    if (eventData.length === 0) {
      return false;
    }

    const data = eventData.join('\n');
    eventData = [];

    if (data === '[DONE]') {
      return true;
    }

    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      emitChunk(data);
      return false;
    }

    if (parsed && typeof parsed === 'object') {
      const payload = parsed;

      if (payload.status === 'error') {
        throw new Error(
          typeof payload.error === 'string' && payload.error.trim()
            ? payload.error
            : 'Scribe streaming failed.'
        );
      }

      if (payload.type === 'meta' || typeof payload.outputId === 'string') {
        if (typeof onOutputId === 'function' && typeof payload.outputId === 'string' && payload.outputId.trim()) {
          onOutputId(payload.outputId.trim());
        }
        return false;
      }

      if (payload.type === 'done') {
        return true;
      }

      if (payload.type === 'error') {
        throw new Error(
          typeof payload.error === 'string' && payload.error.trim()
            ? payload.error
            : 'Scribe streaming failed.'
        );
      }

      const chunkText =
        typeof payload.text === 'string' && payload.text.trim()
          ? payload.text
          : typeof payload.content === 'string' && payload.content.trim()
            ? payload.content
            : '';

      if (chunkText) {
        emitChunk(chunkText);
        return false;
      }
    }

    if (typeof parsed === 'string') {
      emitChunk(parsed);
    } else {
      emitChunk(data);
    }

    return false;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last partial line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const normalizedLine = line.replace(/\r$/, '');

        if (!normalizedLine) {
          if (flushEvent()) {
            return;
          }
          continue;
        }

        if (normalizedLine.startsWith('data:')) {
          eventData.push(normalizedLine.slice(5).replace(/^ /, ''));
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.length > 0) {
      const trailingLines = buffer.split('\n');
      for (const line of trailingLines) {
        const normalizedLine = line.replace(/\r$/, '');

        if (!normalizedLine) {
          if (flushEvent()) {
            return;
          }
          continue;
        }

        if (normalizedLine.startsWith('data:')) {
          eventData.push(normalizedLine.slice(5).replace(/^ /, ''));
        }
      }
    }

    if (eventData.length > 0) {
      flushEvent();
    }
  } catch (error) {
    console.error('Streaming error:', error);
    throw error;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore cancellation errors when the stream is already closed.
    }
  }
}

export default streamScribeNote;