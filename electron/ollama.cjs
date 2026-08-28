/**
 * Módulo de integração com Ollama para pesquisa com IA local.
 * Usa a API REST do Ollama (http://localhost:11434) quando disponível.
 * O modelo recomendado é o "llama3.2" ou "mistral" — leves e rápidos.
 */

const OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';
const MAX_CONTEXT_CHARS = 8000;

/**
 * Verifica se o Ollama está rodando localmente.
 */
async function isOllamaAvailable() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { available: false, models: [] };
    const data = await response.json();
    const models = (data.models || []).map((m) => m.name || m.model || '');
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

/**
 * Envia uma pergunta ao Ollama usando o contexto das notas do usuário.
 * Retorna os IDs das notas relevantes e uma resposta em linguagem natural.
 */
async function askOllama(question, notes, model) {
  const selectedModel = model || DEFAULT_MODEL;

  // Monta o contexto das notas (resumo: título + primeiras linhas de cada nota)
  const noteSummaries = notes
    .filter((n) => n.status === 'active')
    .slice(0, 50) // Limita para performance
    .map((n) => {
      const plainText = (n.content || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      return `[ID:${n.id}] "${n.title || 'Sem título'}": ${plainText}`;
    });

  // Corta o contexto se exceder o limite
  let context = '';
  for (const summary of noteSummaries) {
    if ((context + summary).length > MAX_CONTEXT_CHARS) break;
    context += summary + '\n';
  }

  const systemPrompt = `Você é um assistente de notas pessoais. O usuário tem as seguintes notas:

${context}

Com base nessas notas, responda a pergunta do usuário de forma útil e concisa em português.
Ao final da resposta, liste os IDs das notas mais relevantes no formato: [NOTAS: id1, id2, id3]
Se nenhuma nota for relevante, diga isso claramente.`;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        prompt: question,
        system: systemPrompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 512 },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return { success: false, error: `Ollama respondeu com status ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const responseText = data.response || '';

    // Extrai IDs de notas mencionados na resposta
    const noteIdsMatch = responseText.match(/\[NOTAS?:\s*([^\]]+)\]/i);
    const relevantNoteIds = noteIdsMatch
      ? noteIdsMatch[1].split(',').map((id) => id.trim()).filter(Boolean)
      : [];

    // Remove o bloco [NOTAS: ...] da resposta exibida
    const cleanResponse = responseText.replace(/\[NOTAS?:\s*[^\]]*\]/gi, '').trim();

    return { success: true, response: cleanResponse, relevantNoteIds };
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return { success: false, error: 'A resposta demorou demais. Verifique se o Ollama está funcionando corretamente.' };
    }
    return { success: false, error: error.message || 'Não foi possível se comunicar com o Ollama.' };
  }
}

module.exports = { isOllamaAvailable, askOllama, DEFAULT_MODEL };
