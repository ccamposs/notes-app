/**
 * Resumo das melhorias de cada versão, escrito para o usuário final.
 *
 * A lista fica sempre da versão mais nova para a mais antiga: a primeira
 * entrada é usada como destaque quando não é possível ler a versão instalada.
 */

export type ReleaseChangeKind = 'novo' | 'melhoria' | 'correcao';

export interface ReleaseChange {
  kind: ReleaseChangeKind;
  text: string;
}

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  changes: ReleaseChange[];
}

export const CHANGE_KIND_LABELS: Record<ReleaseChangeKind, string> = {
  novo: 'Novo',
  melhoria: 'Melhoria',
  correcao: 'Correção',
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.3.4',
    date: '2026-08-27',
    title: 'Atualização em um clique',
    summary: 'O aviso de atualização agora aparece dentro do app e instala de verdade ao confirmar.',
    changes: [
      { kind: 'correcao', text: 'Clicar em atualizar agora fecha, instala e reabre o app. Antes o aviso aparecia mas nada acontecia.' },
      { kind: 'novo', text: 'O aviso de atualização virou uma janela no centro da tela, com o resumo do que muda.' },
      { kind: 'novo', text: 'Novo painel de Novidades na barra lateral, com a versão atual em destaque e filtro para ver versões anteriores.' },
      { kind: 'melhoria', text: 'Suas notas são gravadas antes de o app fechar para instalar a atualização.' },
      { kind: 'correcao', text: 'A tela de configurações passa a mostrar a versão realmente instalada.' },
    ],
  },
  {
    version: '1.3.3',
    date: '2026-08-27',
    title: 'Acabamento visual e backup',
    summary: 'Tabelas e sugestões de busca ganharam aparência própria, e o backup ficou mais completo.',
    changes: [
      { kind: 'correcao', text: 'Tabelas no editor voltaram a aparecer com bordas e cabeçalho destacado.' },
      { kind: 'correcao', text: 'A sugestão “Você quis dizer…” da busca agora aparece formatada.' },
      { kind: 'melhoria', text: 'Suas marcações de imagem entram no backup e voltam ao restaurar.' },
    ],
  },
  {
    version: '1.3.2',
    date: '2026-08-27',
    title: 'Tabelas e busca inteligente',
    summary: 'Chegaram as tabelas no editor e a correção automática da busca.',
    changes: [
      { kind: 'novo', text: 'Tabelas no editor, com colunas que você pode redimensionar.' },
      { kind: 'novo', text: 'Quando a busca não encontra nada, o app sugere a palavra mais parecida das suas notas.' },
    ],
  },
  {
    version: '1.3.1',
    date: '2026-08-27',
    title: 'Google Calendar e fim das travadas',
    summary: 'Seus lembretes conversam com o Google Calendar e o app deixou de engasgar ao salvar.',
    changes: [
      { kind: 'novo', text: 'Envie lembretes de tarefas para o Google Calendar, escolhendo tarefa por tarefa ou todas de uma vez.' },
      { kind: 'novo', text: 'Alterações feitas na sua agenda voltam para o app automaticamente.' },
      { kind: 'melhoria', text: 'As pequenas travadas ao sincronizar foram eliminadas.' },
      { kind: 'melhoria', text: 'Ocultar imagens ficou instantâneo, mesmo em notas grandes.' },
      { kind: 'melhoria', text: 'Ao fechar, o app garante que tudo foi salvo antes de encerrar.' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-08-27',
    title: 'Galeria e imagens com superpoderes',
    summary: 'Uma nova galeria e muito mais controle sobre as imagens das suas notas.',
    changes: [
      { kind: 'novo', text: 'Galeria reunindo as imagens de todas as suas notas.' },
      { kind: 'novo', text: 'Oculte imagens com um efeito de desfoque e revele quando quiser.' },
      { kind: 'novo', text: 'Redimensione imagens arrastando a borda.' },
      { kind: 'novo', text: 'Marcações exclusivas para imagens, separadas das tags de notas.' },
      { kind: 'novo', text: 'Arraste imagens de fora e solte direto na nota.' },
    ],
  },
  {
    version: '1.2.2',
    date: '2026-08-27',
    title: 'Publicação de atualizações',
    summary: 'Ajustes internos para que as próximas atualizações cheguem sem falhas.',
    changes: [
      { kind: 'correcao', text: 'Correções na entrega das atualizações automáticas.' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-08-27',
    title: 'Proteção de dados e versão web',
    summary: 'Seus dados ganharam várias camadas de segurança e o app abre no navegador.',
    changes: [
      { kind: 'novo', text: 'Proteção de dados completa, com cópia de segurança e backups automáticos.' },
      { kind: 'novo', text: 'Servidor web embutido: abra suas notas no navegador pelo botão na barra lateral.' },
    ],
  },
  {
    version: '1.1.1',
    date: '2026-08-27',
    title: 'Avisos mais discretos',
    summary: 'O app deixou de exibir mensagens técnicas do atualizador.',
    changes: [
      { kind: 'correcao', text: 'Mensagens de erro do atualizador não aparecem mais para o usuário.' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-27',
    title: 'Sincronização local e atualização automática',
    summary: 'Suas notas passam a sincronizar entre janelas e o app se atualiza sozinho.',
    changes: [
      { kind: 'novo', text: 'Sincronização local entre o aplicativo e o navegador.' },
      { kind: 'novo', text: 'Atualização automática: novas versões são baixadas em segundo plano.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-19',
    title: 'Primeira versão',
    summary: 'O começo de tudo: notas, cadernos, tags, tarefas e busca.',
    changes: [
      { kind: 'novo', text: 'Notas com editor completo, cadernos, tags, favoritos e lixeira.' },
      { kind: 'novo', text: 'Tarefas com lembretes e painel de resumo.' },
    ],
  },
];

/** Compara versões no formato x.y.z, ignorando um "v" inicial. */
function compareVersions(first: string, second: string): number {
  const parse = (value: string) => value.replace(/^v/, '').split('.').map((part) => Number(part) || 0);
  const a = parse(first);
  const b = parse(second);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function normalizeVersion(version: string): string {
  return version.replace(/^v/, '').trim();
}

/**
 * Escolhe a nota que representa a versão instalada. Se a versão exata não
 * estiver na lista, usa a nota mais recente que não seja posterior a ela.
 */
export function findReleaseNote(version: string): ReleaseNote | null {
  if (!version) return null;
  const target = normalizeVersion(version);
  const exact = RELEASE_NOTES.find((note) => note.version === target);
  if (exact) return exact;
  return RELEASE_NOTES.find((note) => compareVersions(note.version, target) <= 0) || null;
}

/**
 * Lista apenas versões mais antigas que a instalada, para que uma versão
 * futura nunca apareça como "anterior".
 */
export function getPreviousReleaseNotes(version: string): ReleaseNote[] {
  const current = findReleaseNote(version);
  if (!current) return RELEASE_NOTES;
  return RELEASE_NOTES.filter((note) => compareVersions(note.version, current.version) < 0);
}

export function formatReleaseDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
