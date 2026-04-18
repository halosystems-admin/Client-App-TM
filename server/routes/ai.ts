import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { generateText, generateTextStream, analyzeImage, transcribeAudio, safeJsonParse } from '../services/gemini';
import { isDeepgramAvailable, transcribeWithDeepgram } from '../services/deepgram';
import { fetchAllFilesInFolder, extractTextFromFile } from '../services/drive';
import {
  summaryPrompt,
  labAlertsPrompt,
  imageAnalysisPrompt,
  searchPrompt,
  chatSystemPrompt,
  soapNotePrompt,
  geminiTranscriptionPrompt,
} from '../utils/prompts';

const router = Router();
router.use(requireAuth);

const getUserId = (req: Request): string =>
  req.session.userEmail ?? req.session.userId ?? 'unknown-user';

function stripScribePreamble(text: string): string {
  const trimmed = text.trim();
  const headingMatch = trimmed.match(/\n(?:##\s+|Subjective:|Objective:|Assessment:|Plan:)/i);
  if (headingMatch?.index && headingMatch.index > 0) {
    return trimmed.slice(headingMatch.index + 1).trim();
  }

  return trimmed.replace(
    /^(?:I\s+(?:will|’?ll)|Sure[,!]?|Certainly[,!]?|Of course[,!]?|Here(?:'s| is)[^\n]*\n+)/i,
    ''
  ).trim();
}

// POST /summary — enhanced: reads actual file content (PDF, DOCX, TXT, Google Docs)
router.post('/summary', async (req: Request, res: Response) => {
  try {
    const { patientName, patientId, files } = req.body as {
      patientName?: string;
      patientId?: string;
      files?: Array<{ name: string; createdTime: string }>;
    };

    if (!patientName || !files || !Array.isArray(files)) {
      res.status(400).json({ error: 'patientName and files are required.' });
      return;
    }

    let fileContext = files
      .slice(0, 8)
      .map((f) => `- ${f.name} (${f.createdTime})`)
      .join('\n');

    // If patientId and token available, read actual file contents for richer summary
    const token = req.session.accessToken;
    if (patientId && token) {
      try {
        const allFiles = await fetchAllFilesInFolder(token, patientId);
        const readableFiles = allFiles.filter(f =>
          f.name.endsWith('.txt') ||
          f.name.endsWith('.pdf') ||
          f.name.endsWith('.docx') ||
          f.name.endsWith('.doc') ||
          f.mimeType === 'text/plain' ||
          f.mimeType === 'application/pdf' ||
          f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          f.mimeType === 'application/msword' ||
          f.mimeType === 'application/vnd.google-apps.document'
        ).slice(0, 5);

        const contentParts: string[] = [];
        for (const file of readableFiles) {
          const text = await extractTextFromFile(token, file, 1500);
          if (text.trim()) {
            contentParts.push(`--- ${file.name} ---\n${text}`);
          }
        }

        if (contentParts.length > 0) {
          fileContext += '\n\nFile Contents:\n' + contentParts.join('\n\n');
        }
      } catch {
        // Fall back to file-name-only summary if content extraction fails
      }
    }

    const userId = getUserId(req);
    const text = await generateText(
      summaryPrompt(patientName, fileContext),
      userId,
      'Gemini-Patient-Summary',
      true
    );
    res.json(safeJsonParse<string[]>(text, ['Summary unavailable.']));
  } catch (err) {
    console.error('Summary error:', err);
    res.json(['Summary unavailable.']);
  }
});

// POST /lab-alerts
router.post('/lab-alerts', async (req: Request, res: Response) => {
  try {
    const { content } = req.body as { content?: string };

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Content is required for lab alert extraction.' });
      return;
    }

    const userId = getUserId(req);
    const text = await generateText(
      labAlertsPrompt(content),
      userId,
      'Gemini-Lab-Alerts',
      false
    );
    res.json(safeJsonParse(text, []));
  } catch (err) {
    console.error('Lab alerts error:', err);
    res.json([]);
  }
});

// POST /analyze-image
router.post('/analyze-image', async (req: Request, res: Response) => {
  try {
    const { base64Image } = req.body as { base64Image?: string };

    if (!base64Image || typeof base64Image !== 'string') {
      res.status(400).json({ error: 'base64Image is required.' });
      return;
    }

    const cleanBase64 = base64Image.split(',')[1] || base64Image;
    const userId = getUserId(req);
    const text = await analyzeImage(
      imageAnalysisPrompt(),
      cleanBase64,
      'image/jpeg',
      userId,
      'Gemini-Image-Vision',
      true
    );
    const filename = text.trim() || 'processed_image.jpg';

    res.json({ filename });
  } catch (err) {
    console.error('Image analysis error:', err);
    res.json({ filename: `image_${Date.now()}.jpg` });
  }
});

// POST /search (enhanced: includes file content context for concept-based search)
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, patients, files } = req.body as {
      query?: string;
      patients?: Array<{ id: string; name: string }>;
      files?: Record<string, Array<{ name: string }>>;
    };

    if (!patients || !Array.isArray(patients)) {
      res.status(400).json({ error: 'patients array is required.' });
      return;
    }

    if (!query) {
      res.json(patients.map((p) => p.id));
      return;
    }

    const token = req.session.accessToken!;
    const userId = getUserId(req);

    // Build rich context: file names + snippet of text file contents per patient
    const contextParts: string[] = [];
    for (const p of patients) {
      const pFiles = files?.[p.id] || [];
      const fileNames = pFiles.map((f) => f.name).join(', ');
      let contentSnippets = '';

      // Fetch content from up to 5 readable files per patient for concept matching
      try {
        const allFiles = await fetchAllFilesInFolder(token, p.id);
        const readableFiles = allFiles.filter(f =>
          f.name.endsWith('.txt') ||
          f.name.endsWith('.pdf') ||
          f.name.endsWith('.docx') ||
          f.name.endsWith('.doc') ||
          f.mimeType === 'text/plain' ||
          f.mimeType === 'application/pdf' ||
          f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          f.mimeType === 'application/msword' ||
          f.mimeType === 'application/vnd.google-apps.document'
        ).slice(0, 5);

        for (const rf of readableFiles) {
          const text = await extractTextFromFile(token, rf, 500);
          if (text.trim()) {
            contentSnippets += ` | ${rf.name}: ${text}`;
          }
        }
      } catch {
        // Skip patients whose files can't be fetched
      }

      contextParts.push(`ID: ${p.id}, Name: ${p.name}, Files: [${fileNames}]${contentSnippets ? `, Content: [${contentSnippets.substring(0, 1500)}]` : ''}`);
    }

    const context = contextParts.join('\n');
    const text = await generateText(
      searchPrompt(query, context),
      userId,
      'Gemini-Concept-Search',
      true
    );
    res.json(safeJsonParse<string[]>(text, []));
  } catch (err) {
    console.error('Search error:', err);
    res.json([]);
  }
});

// Shared chat context builder (used by /chat and /chat-stream)
// Shared chat context builder (used by /chat and /chat-stream)
async function buildChatContext(
  token: string,
  patientId: string,
  question: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  const allFiles = await fetchAllFilesInFolder(token, patientId);
  const readableFiles = allFiles.filter(f =>
    f.name.endsWith('.txt') ||
    f.name.endsWith('.pdf') ||
    f.name.endsWith('.docx') ||
    f.name.endsWith('.doc') ||
    f.mimeType === 'text/plain' ||
    f.mimeType === 'application/pdf' ||
    f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    f.mimeType === 'application/msword' ||
    f.mimeType === 'application/vnd.google-apps.document'
  ).slice(0, 10);

  const contextParts: string[] = [];
  const fileList = allFiles
    .filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
    .map(f => `- ${f.name} (${f.mimeType})`)
    .join('\n');
  contextParts.push(`Patient files:\n${fileList}`);

  // THE FIX: Fetch all files in parallel simultaneously!
  const fileContents = await Promise.all(
    readableFiles.map(async (file) => {
      try {
        const textContent = await extractTextFromFile(token, file, 2000);
        if (textContent.trim()) {
          return `\n--- File: ${file.name} ---\n${textContent}`;
        }
      } catch (err) {
        console.error(`Failed to extract ${file.name}`, err);
      }
      return '';
    })
  );

  // Add all downloaded contents to our context
  contextParts.push(...fileContents);

  const fullContext = contextParts.join('\n').substring(0, 15000);
  const conversationHistory = (history || [])
    .slice(-10)
    .map(m => `${m.role === 'user' ? 'User' : 'HALO'}: ${m.content}`)
    .join('\n');

  return chatSystemPrompt(fullContext, conversationHistory, question);
}

// POST /chat-stream - HALO medical chatbot (streaming SSE)
router.post('/chat-stream', async (req: Request, res: Response) => {
  try {
    const { patientId, question, history } = req.body as {
      patientId?: string;
      question?: string;
      history?: Array<{ role: string; content: string }>;
    };

    if (!patientId || !question || typeof question !== 'string') {
      res.status(400).json({ error: 'patientId and question are required.' });
      return;
    }

    const token = req.session.accessToken!;
    const prompt = await buildChatContext(token, patientId, question, history || []);
    const userId = getUserId(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    for await (const chunk of generateTextStream(
      prompt,
      userId,
      'Gemini-Halo-Chat',
      false
    )) {
      const escaped = JSON.stringify(chunk);
      res.write(`data: ${escaped}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat failed. Please try again.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'An error occurred.' })}\n\n`);
      res.end();
    }
  }
});

// POST /chat - HALO medical chatbot (non-streaming fallback)
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { patientId, question, history } = req.body as {
      patientId?: string;
      question?: string;
      history?: Array<{ role: string; content: string }>;
    };

    if (!patientId || !question || typeof question !== 'string') {
      res.status(400).json({ error: 'patientId and question are required.' });
      return;
    }

    const token = req.session.accessToken!;
    const prompt = await buildChatContext(token, patientId, question, history || []);
    const userId = getUserId(req);
    const reply = await generateText(
      prompt,
      userId,
      'Gemini-Halo-Chat',
      false
    );
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.json({ reply: 'I apologize, but I encountered an error processing your question. Please try again.' });
  }
});

// POST /transcribe
router.post('/transcribe', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType, customTemplate } = req.body as {
      audioBase64?: string;
      mimeType?: string;
      customTemplate?: string;
    };

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      res.status(400).json({ error: 'audioBase64 is required.' });
      return;
    }

    const cleanBase64 = audioBase64.split(',')[1] || audioBase64;
    const userId = getUserId(req);
    const audioBuffer = Buffer.from(cleanBase64, 'base64');
    const audioMime = mimeType || 'audio/webm';

    // Fallback to Gemini if Deepgram is not available
    if (!isDeepgramAvailable()) {
      console.log('Deepgram key not set, falling back to Gemini for transcription');
      const soapNote = stripScribePreamble(await transcribeAudio(
        geminiTranscriptionPrompt(customTemplate),
        cleanBase64,
        audioMime,
        userId,
        'Gemini-Audio-SOAP-Fallback',
        false
      ));
      res.json({ soapNote, rawTranscript: '' });
      return;
    }

    const transcript = await transcribeWithDeepgram(audioBuffer, audioMime);

    if (!transcript) {
      res.json({ soapNote: 'Error: No speech detected in audio.' });
      return;
    }

    const soapNote = stripScribePreamble(await generateText(
      soapNotePrompt(transcript, customTemplate),
      userId,
      'Gemini-SOAP-Gen',
      false
    ));
    res.json({ soapNote, rawTranscript: transcript });
  } catch (err) {
    console.error('Transcribe error:', err);
    res.json({ soapNote: 'Error: Could not transcribe audio.' });
  }
});

export default router;
