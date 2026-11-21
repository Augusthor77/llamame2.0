import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const ALLOWED_LANGS = new Set(['es', 'en', 'pt', 'fr']);
const ALLOWED_MODES = new Set(['simplify', 'clarify', 'replies', 'summarize']);

interface AssistMessage {
  sender: string;
  text: string;
}

const app = express();
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    externalApis: ['MyMemory Translation API', 'Wikipedia ES / Free Dictionary API'],
  });
});

app.get('/api/external/translate', async (req: Request, res: Response) => {
  try {
    const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const from = typeof req.query.from === 'string' ? req.query.from.trim().toLowerCase() : 'es';
    const to = typeof req.query.to === 'string' ? req.query.to.trim().toLowerCase() : 'en';

    if (!rawQ || rawQ.length > 400) {
      res.status(400).json({ error: 'El texto debe tener entre 1 y 400 caracteres.' });
      return;
    }
    if (!ALLOWED_LANGS.has(from) || !ALLOWED_LANGS.has(to) || from === to) {
      res.status(400).json({ error: 'Par de idiomas no válido.' });
      return;
    }

    const upstreamUrl = new URL('https://api.mymemory.translated.net/get');
    upstreamUrl.searchParams.set('q', rawQ);
    upstreamUrl.searchParams.set('langpair', `${from}|${to}`);

    const upstream = await fetch(upstreamUrl.toString(), {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });

    if (!upstream.ok) {
      res.status(502).json({ error: `El servicio de traducción respondió con código ${upstream.status}.` });
      return;
    }

    const payload = (await upstream.json()) as {
      responseStatus?: number;
      responseData?: { translatedText?: string; match?: number };
    };

    const translatedText = payload.responseData?.translatedText?.trim();
    if (!translatedText) {
      res.status(502).json({ error: 'No se recibió una traducción válida del proveedor externo.' });
      return;
    }

    res.json({
      translatedText,
      from,
      to,
      match: typeof payload.responseData?.match === 'number' ? payload.responseData.match : null,
      provider: 'MyMemory Translation API',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al consultar traducción externa.';
    res.status(502).json({ error: message });
  }
});

app.get('/api/external/dictionary', async (req: Request, res: Response) => {
  try {
    const rawTerm = typeof req.query.term === 'string' ? req.query.term.trim() : '';
    const lang = req.query.lang === 'en' ? 'en' : 'es';

    if (!rawTerm || rawTerm.length > 80) {
      res.status(400).json({ error: 'Escribe un término de entre 1 y 80 caracteres.' });
      return;
    }

    if (lang === 'en') {
      const safeWord = encodeURIComponent(rawTerm.toLowerCase());
      const upstream = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${safeWord}`, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json' },
      });

      if (upstream.status === 404) {
        res.status(404).json({ error: `No encontramos "${rawTerm}" en el diccionario de inglés.` });
        return;
      }
      if (!upstream.ok) {
        res.status(502).json({ error: `Error del diccionario externo (${upstream.status}).` });
        return;
      }

      const data = (await upstream.json()) as Array<{
        word?: string;
        phonetic?: string;
        meanings?: Array<{
          partOfSpeech?: string;
          definitions?: Array<{ definition?: string; example?: string }>;
        }>;
        sourceUrls?: string[];
      }>;

      const entry = data[0];
      const firstMeaning = entry?.meanings?.[0];
      const firstDef = firstMeaning?.definitions?.[0];

      res.json({
        title: entry?.word || rawTerm,
        description: [firstMeaning?.partOfSpeech, entry?.phonetic].filter(Boolean).join(' · '),
        extract: firstDef?.definition || 'Sin definición disponible.',
        example: firstDef?.example || '',
        url: entry?.sourceUrls?.[0] || '',
        provider: 'Free Dictionary API',
      });
      return;
    }

    const formattedTerm = rawTerm.replace(/\s+/g, '_');
    const safeSlug = encodeURIComponent(formattedTerm);
    const upstream = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${safeSlug}`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SenaVozApp/1.0 (accessibility-learning-tool)',
      },
    });

    if (upstream.status === 404) {
      res.status(404).json({ error: `No encontramos una ficha directa para "${rawTerm}".` });
      return;
    }
    if (!upstream.ok) {
      res.status(502).json({ error: `Error de consulta externa (${upstream.status}).` });
      return;
    }

    const data = (await upstream.json()) as {
      title?: string;
      description?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };

    res.json({
      title: data.title || rawTerm,
      description: data.description || 'Definición conceptual en español',
      extract: data.extract || 'No hay resumen disponible para este término.',
      example: '',
      url: data.content_urls?.desktop?.page || '',
      provider: 'Wikipedia ES REST API',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al consultar el diccionario externo.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/ai/assist', async (req: Request, res: Response) => {
  const ai = createGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'La clave de Gemini no está configurada en el servidor. Configura GEMINI_API_KEY en Settings > Secrets.',
    });
    return;
  }

  try {
    const body = req.body as {
      mode?: unknown;
      text?: unknown;
      role?: unknown;
      messages?: unknown;
    };

    const mode = typeof body.mode === 'string' ? body.mode : '';
    if (!ALLOWED_MODES.has(mode)) {
      res.status(400).json({ error: 'Modo de asistencia no válido.' });
      return;
    }

    const role = body.role === 'sorda' ? 'persona sorda' : 'persona oyente';

    if (mode === 'simplify' || mode === 'clarify') {
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1200) : '';
      if (!text) {
        res.status(400).json({ error: 'Envía un texto para procesar.' });
        return;
      }

      const instruction =
        mode === 'simplify'
          ? 'Eres especialista en accesibilidad cognitiva y Lectura Fácil en español. Reescribe el mensaje dado usando frases cortas, claras, directas y fáciles de leer en voz alta o en subtítulos, manteniendo exactamente el significado original. Devuelve únicamente el texto adaptado sin comillas ni explicaciones.'
          : 'Eres un asistente de comunicación para personas sordas y oyentes en SeñaVoz. Toma el borrador o frase rápida del usuario (que puede tener orden telegráfico propio de lengua de señas o dictado rápido) y redacta una versión natural, clara y respetuosa en español sin cambiar la intención. Devuelve únicamente la frase corregida.';

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: text,
        config: {
          systemInstruction: instruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      res.json({ result: (response.text || '').trim() });
      return;
    }

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const safeMessages: AssistMessage[] = rawMessages
      .slice(-24)
      .filter(
        (m): m is AssistMessage =>
          Boolean(m) &&
          typeof m === 'object' &&
          typeof (m as AssistMessage).sender === 'string' &&
          typeof (m as AssistMessage).text === 'string'
      )
      .map((m) => ({
        sender: m.sender.trim().slice(0, 40),
        text: m.text.trim().slice(0, 400),
      }))
      .filter((m) => m.text.length > 0);

    if (safeMessages.length === 0) {
      res.status(400).json({ error: 'No hay mensajes suficientes para analizar.' });
      return;
    }

    const transcriptText = safeMessages.map((m) => `${m.sender}: ${m.text}`).join('\n');

    if (mode === 'replies') {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Rol actual del usuario que va a responder: ${role}.\nÚltimos mensajes de la llamada:\n${transcriptText}`,
        config: {
          systemInstruction:
            'Genera exactamente 3 respuestas rápidas y naturales en español (máximo 10 palabras cada una) apropiadas para el rol del usuario dentro de esta videollamada accesible.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      });

      let replies: string[] = [];
      try {
        const parsed = JSON.parse(response.text || '[]') as unknown;
        if (Array.isArray(parsed)) {
          replies = parsed.filter((item): item is string => typeof item === 'string').slice(0, 3);
        }
      } catch {
        replies = [];
      }

      res.json({ replies });
      return;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Transcripción de la videollamada SeñaVoz:\n${transcriptText}`,
      config: {
        systemInstruction:
          'Resume la conversación de forma clara y accesible en español. Identifica un resumen general breve (2-3 oraciones), hasta 4 puntos clave y hasta 3 acuerdos o siguientes pasos.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['summary', 'keyPoints', 'actionItems'],
        },
      },
    });

    const parsedSummary = JSON.parse(response.text || '{}') as {
      summary?: string;
      keyPoints?: string[];
      actionItems?: string[];
    };

    res.json({
      summary: parsedSummary.summary || '',
      keyPoints: Array.isArray(parsedSummary.keyPoints) ? parsedSummary.keyPoints : [],
      actionItems: Array.isArray(parsedSummary.actionItems) ? parsedSummary.actionItems : [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al procesar asistencia inteligente.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build no encontrado. Ejecuta npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SeñaVoz server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
