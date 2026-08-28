import { Note } from './types';

/**
 * Correção automática de busca baseada no vocabulário das notas do usuário.
 * Usa a distância de Levenshtein para encontrar a palavra mais parecida
 * com o termo digitado, desde que ela exista nas notas e traga resultados.
 */

const MIN_WORD_LENGTH = 3;
const MAX_DISTANCE = 3; // Máximo de edições para considerar como correção

/**
 * Calcula a distância de Levenshtein entre duas strings.
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deleção
        matrix[i][j - 1] + 1,       // inserção
        matrix[i - 1][j - 1] + cost  // substituição
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Extrai o vocabulário das notas (palavras únicas com frequência).
 */
function buildVocabulary(notes: Note[]): Map<string, number> {
  const vocab = new Map<string, number>();

  for (const note of notes) {
    if (note.status !== 'active') continue;
    const text = `${note.title} ${note.content}`
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .toLowerCase();

    const words = text.match(/[\p{L}\p{N}]+/gu) || [];
    for (const word of words) {
      if (word.length >= MIN_WORD_LENGTH) {
        vocab.set(word, (vocab.get(word) || 0) + 1);
      }
    }
  }

  return vocab;
}

/**
 * Verifica se um termo encontra resultados nas notas.
 */
function hasResults(notes: Note[], term: string): boolean {
  const lower = term.toLowerCase();
  return notes.some((note) => {
    if (note.status !== 'active') return false;
    const text = `${note.title} ${note.content}`.toLowerCase();
    return text.includes(lower);
  });
}

export interface SearchSuggestion {
  original: string;
  corrected: string;
  distance: number;
}

/**
 * Dado um termo de busca sem resultados, sugere a correção mais provável
 * baseada no vocabulário das notas do usuário.
 */
export function getSuggestion(query: string, notes: Note[]): SearchSuggestion | null {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || trimmed.length < MIN_WORD_LENGTH) return null;

  // Se já tem resultados, não sugere nada
  if (hasResults(notes, trimmed)) return null;

  const vocab = buildVocabulary(notes);
  let bestWord = '';
  let bestDistance = MAX_DISTANCE + 1;
  let bestFrequency = 0;

  for (const [word, frequency] of vocab) {
    // Pula palavras muito diferentes em tamanho
    if (Math.abs(word.length - trimmed.length) > MAX_DISTANCE) continue;

    const distance = levenshtein(trimmed, word);
    if (distance > 0 && distance <= MAX_DISTANCE) {
      // Prioriza menor distância, depois maior frequência
      if (distance < bestDistance || (distance === bestDistance && frequency > bestFrequency)) {
        // Só sugere se a palavra corrigida realmente traz resultados
        if (hasResults(notes, word)) {
          bestWord = word;
          bestDistance = distance;
          bestFrequency = frequency;
        }
      }
    }
  }

  if (!bestWord) return null;

  return {
    original: trimmed,
    corrected: bestWord,
    distance: bestDistance,
  };
}
