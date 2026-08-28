/**
 * Pesquisa com IA em duas etapas:
 * 1. Embedding (nomic-embed-text) — encontra as notas mais relevantes por similaridade vetorial
 * 2. LLM (qwen2.5:3b) — gera uma resposta em português usando apenas as notas encontradas
 *
 * Usa a API REST do Ollama local (http://localhost:11434).
 * Funciona 100% offline no computador do usuário.
 */

const OLLAMA_BASE_URL = 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';
const CHAT_MODEL = 'qwen2.5:3b';
const TOP_K = 8; // Quantidade de notas enviadas à LLM
const MAX_NOTE_CHARS = 600; // Limite de texto por nota no contexto

// Cache de embeddings para não recalcular a cada pergunta
let embeddingCache = new Map(); // noteId -> { hash, vector }

/**
 * Verifica se o Ollama está rodando e quais modelos estão disponíveis.
 */
async function isOllamaAvailable() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { available: false, models: [], hasEmbed: false, hasChat: false };
    const data = await response.json();
    const models = (data.models || []).map((m) => m.name?.split(':')[0] || '');
    const hasEmbed = models.includes('nomic-embed-text');
    const hasChat = models.some((m) => m.startsWith('qwen2.5') || m.startsWith('llama') || m.startsWith('mistral') || m.startsWith('phi'));
    return { available: true, models, hasEmbed, hasChat };
  } catch {
    return { available: false, models: [], hasEmbed: false, hasChat: false };
  }
}

/**
 * Gera o embedding de um texto usando o modelo de embeddings.
 */
async function getEmbedding(text) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Embedding falhou: ${response.status}`);
  const data = await response.json();
  return data.embedding;
}

/**
 * Calcula a similaridade cosseno entre dois vetores.
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Hash simples para detectar se o conteúdo da nota mudou.
 */
function simpleHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * Extrai texto limpo de uma nota.
 */
function noteToPlainText(note) {
  const text = (note.content || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return `${note.title || 'Sem título'}: ${text}`.slice(0, MAX_NOTE_CHARS);
}

/**
 * Etapa 1: Encontra as notas mais relevantes usando embeddings.
 */
async function findRelevantNotes(question, notes) {
  // Gera embedding da pergunta
  const questionVector = await getEmbedding(question);

  // Gera/atualiza embeddings das notas (usa cache quando possível)
  const noteVectors = [];
  for (const note of notes) {
    const plainText = noteToPlainText(note);
    const hash = simpleHash(plainText);
    const cached = embeddingCache.get(note.id);

    let vector;
    if (cached && cached.hash === hash) {
      vector = cached.vector;
    } else {
      try {
        vector = await getEmbedding(plainText);
        embeddingCache.set(note.id, { hash, vector });
      } catch {
        continue; // Pula notas que falham
      }
    }
    noteVectors.push({ note, vector, plainText });
  }

  // Ordena por similaridade e retorna as top K
  const scored = noteVectors
    .map((item) => ({ ...item, score: cosineSimilarity(questionVector, item.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  return scored;
}

/**
 * Etapa 2: Gera a resposta usando a LLM com apenas as notas relevantes.
 */
async function generateAnswer(question, relevantNotes) {
  const context = relevantNotes
    .map((item) => `[ID:${item.note.id}] ${item.plainText}`)
    .join('\n\n');

  const systemPrompt = `Você é um assistente de notas pessoais. Responda em português de forma concisa e útil.
Aqui estão as notas mais relevantes do usuário:

${context}

Instruções:
- Responda baseando-se apenas no conteúdo das notas acima.
- Se nenhuma nota responder a pergunta, diga isso claramente.
- Ao final, liste os IDs das notas usadas no formato: [NOTAS: id1, id2]`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      prompt: question,
      system: systemPrompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 400 },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`LLM respondeu com status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.response || '';
}

/**
 * Fluxo completo: embedding → busca → LLM → resposta.
 */
async function askOllama(question, notes, model) {
  try {
    // Etapa 1: encontrar notas relevantes via embedding
    let relevantNotes;
    try {
      relevantNotes = await findRelevantNotes(question, notes);
    } catch (embedError) {
      // Fallback: se embedding falhar, usa as primeiras 10 notas diretamente
      console.warn('Embedding indisponível, usando fallback:', embedError.message);
      relevantNotes = notes.slice(0, 10).map((note) => ({
        note,
        plainText: noteToPlainText(note),
        score: 0,
      }));
    }

    if (relevantNotes.length === 0) {
      return { success: true, response: 'Não encontrei notas relacionadas à sua pergunta.', relevantNoteIds: [] };
    }

    // Etapa 2: gerar resposta com a LLM
    const chatModel = model || CHAT_MODEL;
    const responseText = await generateAnswer(question, relevantNotes);

    // Extrai IDs mencionados na resposta
    const noteIdsMatch = responseText.match(/\[NOTAS?:\s*([^\]]+)\]/i);
    const mentionedIds = noteIdsMatch
      ? noteIdsMatch[1].split(',').map((id) => id.trim()).filter(Boolean)
      : [];

    // Se a LLM não listou IDs, usa os que o embedding encontrou (top 5)
    const relevantNoteIds = mentionedIds.length > 0
      ? mentionedIds
      : relevantNotes.slice(0, 5).map((item) => item.note.id);

    const cleanResponse = responseText.replace(/\[NOTAS?:\s*[^\]]*\]/gi, '').trim();

    return { success: true, response: cleanResponse, relevantNoteIds };
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return { success: false, error: 'A resposta demorou demais. Verifique se o Ollama está funcionando.' };
    }
    return { success: false, error: error.message || 'Não foi possível se comunicar com o Ollama.' };
  }
}

/**
 * Limpa o cache de embeddings (útil ao excluir notas).
 */
function clearEmbeddingCache() {
  embeddingCache = new Map();
}

module.exports = { isOllamaAvailable, askOllama, clearEmbeddingCache, EMBED_MODEL, CHAT_MODEL };
