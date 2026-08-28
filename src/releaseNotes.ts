/**
 * Notas de versão do app — escritas para o usuário final.
 * Ordem: mais nova primeiro. O componente WhatsNew agrupa por tipo.
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

export const CHANGE_KIND_ICONS: Record<ReleaseChangeKind, string> = {
  novo: '✨',
  melhoria: '⚡',
  correcao: '🔧',
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.3.11',
    date: '2026-08-28',
    title: 'Novidades sempre visíveis',
    summary: 'O painel de novidades agora mostra corretamente as melhorias de cada versão, sem atrasos.',
    changes: [
      { kind: 'correcao', text: 'O resumo das novidades aparece imediatamente após atualizar — não mostra mais "em breve".' },
      { kind: 'correcao', text: 'Nunca mais exibe uma versão antiga como se fosse a atual.' },
    ],
  },
  {
    version: '1.3.10',
    date: '2026-08-28',
    title: 'Versão real no painel',
    summary: 'O painel de novidades passou a mostrar a versão real instalada em vez de uma anterior.',
    changes: [
      { kind: 'correcao', text: 'Painel de novidades não confunde mais a versão exibida com uma versão antiga.' },
      { kind: 'correcao', text: 'Abertura automática funciona mesmo quando a versão não tem entrada detalhada.' },
    ],
  },
  {
    version: '1.3.9',
    date: '2026-08-28',
    title: 'Visual refinado',
    summary: 'Modal de atualização simplificado e melhorias visuais no painel de novidades.',
    changes: [
      { kind: 'melhoria', text: 'Modal de atualização não lista mais mudanças da versão errada — só avisa e instala.' },
      { kind: 'melhoria', text: 'Painel de novidades com animação de entrada mais suave e cards com hover elevado.' },
      { kind: 'melhoria', text: 'Botão de atualizar com gradiente e efeito de profundidade.' },
      { kind: 'melhoria', text: 'Card da versão atual com fundo em gradiente e brilho decorativo.' },
    ],
  },
  {
    version: '1.3.7',
    date: '2026-08-28',
    title: 'IA com busca vetorial',
    summary: 'A pesquisa com IA agora usa embeddings para encontrar notas com muito mais precisão e velocidade.',
    changes: [
      { kind: 'melhoria', text: 'Busca em duas etapas: embedding encontra as notas relevantes, LLM gera a resposta.' },
      { kind: 'melhoria', text: 'Cache de vetores: notas que não mudaram não são recalculadas.' },
      { kind: 'melhoria', text: 'Funciona bem mesmo com centenas de notas (antes limitava a 50).' },
      { kind: 'melhoria', text: 'Modelo padrão trocado para Qwen 2.5 3B — mais rápido e preciso em português.' },
    ],
  },
  {
    version: '1.3.6',
    date: '2026-08-28',
    title: 'Proteção, IA e controle total',
    summary: 'Proteja notas e imagens com senha, pesquise com inteligência artificial e impeça conflitos de atualização.',
    changes: [
      { kind: 'novo', text: 'Bloqueio de nota e caderno com senha — ficam completamente invisíveis até você autenticar.' },
      { kind: 'novo', text: 'Proteção de imagem com senha — criptografa o conteúdo da imagem com AES-256.' },
      { kind: 'novo', text: 'Spoiler de texto — selecione um trecho e aplique blur com um clique na barra flutuante.' },
      { kind: 'novo', text: 'Pesquisa com IA (Ollama) — pergunte em linguagem natural e veja as notas relevantes como cards.' },
      { kind: 'melhoria', text: 'Menu de imagem reorganizado: "Ocultar", "Revelar", "Proteger com senha" e "Manter visível".' },
      { kind: 'melhoria', text: 'Painel de novidades agrupado por tipo, com ícones e descrições mais claras.' },
      { kind: 'correcao', text: 'O app agora abre uma única janela — antes podia abrir duas cópias e travar a atualização.' },
      { kind: 'correcao', text: 'Configurações passa a mostrar a versão real instalada, não mais "1.0.0".' },
    ],
  },
  {
    version: '1.3.5',
    date: '2026-08-27',
    title: 'Infraestrutura de proteção',
    summary: 'Os módulos de criptografia e as extensões de spoiler foram adicionados ao projeto.',
    changes: [
      { kind: 'novo', text: 'Módulo de criptografia AES-GCM 256 bits para proteção de conteúdo.' },
      { kind: 'novo', text: 'Modal de senha reutilizável para criar e desbloquear conteúdo protegido.' },
      { kind: 'novo', text: 'Extensão de spoiler de texto (TipTap mark) com suporte a proteção.' },
      { kind: 'melhoria', text: 'Atributos de proteção por senha adicionados às imagens, preservando o redimensionamento.' },
    ],
  },
  {
    version: '1.3.4',
    date: '2026-08-27',
    title: 'Atualização em um clique',
    summary: 'O aviso de atualização agora aparece dentro do app e instala de verdade ao confirmar.',
    changes: [
      { kind: 'correcao', text: 'Clicar em "Atualizar" agora fecha o app, instala e reabre automaticamente.' },
      { kind: 'novo', text: 'Janela central de atualização com resumo das melhorias da nova versão.' },
      { kind: 'novo', text: 'Painel de Novidades na barra lateral — versão atual em destaque e filtro para anteriores.' },
      { kind: 'melhoria', text: 'Seus dados são gravados antes de o app fechar para instalar.' },
    ],
  },
  {
    version: '1.3.3',
    date: '2026-08-27',
    title: 'Acabamento visual e backup',
    summary: 'Tabelas e busca ganharam aparência própria, e o backup ficou mais completo.',
    changes: [
      { kind: 'correcao', text: 'Tabelas no editor voltaram a aparecer com bordas e cabeçalho.' },
      { kind: 'correcao', text: 'Sugestão "Você quis dizer…" agora aparece formatada corretamente.' },
      { kind: 'melhoria', text: 'Marcações de imagem entram no backup e voltam ao restaurar.' },
    ],
  },
  {
    version: '1.3.2',
    date: '2026-08-27',
    title: 'Tabelas e busca inteligente',
    summary: 'O editor ganhou tabelas e a busca sugere correções quando não encontra resultados.',
    changes: [
      { kind: 'novo', text: 'Tabelas no editor com colunas redimensionáveis.' },
      { kind: 'novo', text: 'Busca com correção automática — "Você quis dizer…?" baseada nas suas notas.' },
    ],
  },
  {
    version: '1.3.1',
    date: '2026-08-27',
    title: 'Google Calendar e desempenho',
    summary: 'Lembretes conversam com o Google Calendar e o app parou de engasgar ao salvar.',
    changes: [
      { kind: 'novo', text: 'Sincronização bidirecional com Google Calendar — tarefa por tarefa ou todas de uma vez.' },
      { kind: 'novo', text: 'Alterações feitas na agenda voltam para o app automaticamente.' },
      { kind: 'melhoria', text: 'Eliminadas as pausas perceptíveis ao sincronizar dados.' },
      { kind: 'melhoria', text: 'Ocultar imagens ficou instantâneo, mesmo em notas grandes.' },
      { kind: 'melhoria', text: 'Ao fechar, o app garante que tudo foi salvo antes de encerrar.' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-08-27',
    title: 'Galeria de imagens',
    summary: 'Uma galeria reúne as imagens de todas as notas com controles avançados.',
    changes: [
      { kind: 'novo', text: 'Galeria com todas as imagens das suas notas em um lugar.' },
      { kind: 'novo', text: 'Ocultar/revelar imagens com efeito de desfoque.' },
      { kind: 'novo', text: 'Redimensionar imagens arrastando a borda.' },
      { kind: 'novo', text: 'Marcações exclusivas para imagens, filtráveis na galeria.' },
      { kind: 'novo', text: 'Arraste imagens de fora e solte direto na nota.' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-08-27',
    title: 'Proteção de dados e versão web',
    summary: 'Seus dados ganharam várias camadas de segurança e o app abre no navegador.',
    changes: [
      { kind: 'novo', text: 'Cópia de segurança automática com verificação de integridade.' },
      { kind: 'novo', text: 'Abra suas notas no navegador pelo botão "Abrir no navegador".' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-27',
    title: 'Sincronização e atualização automática',
    summary: 'Suas notas sincronizam entre janelas e o app se atualiza sozinho.',
    changes: [
      { kind: 'novo', text: 'Sincronização local entre o aplicativo e o navegador.' },
      { kind: 'novo', text: 'Atualização automática em segundo plano.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-19',
    title: 'Primeira versão',
    summary: 'O começo de tudo: notas, cadernos, tags, tarefas e busca.',
    changes: [
      { kind: 'novo', text: 'Editor completo com cadernos, tags, favoritos e lixeira.' },
      { kind: 'novo', text: 'Tarefas com lembretes, recorrência e painel de resumo.' },
    ],
  },
];

/** Compara versões x.y.z. Retorna positivo se first > second. */
function compareVersions(first: string, second: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((p) => Number(p) || 0);
  const a = parse(first);
  const b = parse(second);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function normalizeVersion(version: string): string {
  return version.replace(/^v/, '').trim();
}

/**
 * Busca a nota EXATA da versão instalada. Se não existir entrada para essa
 * versão, retorna null — o componente mostra a versão real sem confundir
 * com uma versão anterior. Isso evita o bug de exibir "v1.3.6" quando o
 * app já está na v1.3.9.
 */
export function findReleaseNote(version: string): ReleaseNote | null {
  if (!version) return null;
  const target = normalizeVersion(version);
  return RELEASE_NOTES.find((n) => n.version === target) || null;
}

/**
 * Lista versões anteriores à instalada. Se a versão instalada não tiver
 * entrada, lista todas que são estritamente menores que ela.
 */
export function getPreviousReleaseNotes(version: string): ReleaseNote[] {
  if (!version) return RELEASE_NOTES;
  const target = normalizeVersion(version);
  return RELEASE_NOTES.filter((n) => compareVersions(n.version, target) < 0);
}

export function formatReleaseDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Agrupa as mudanças de uma nota por tipo. */
export function groupChangesByKind(changes: ReleaseChange[]): Record<ReleaseChangeKind, ReleaseChange[]> {
  const groups: Record<ReleaseChangeKind, ReleaseChange[]> = { novo: [], melhoria: [], correcao: [] };
  for (const change of changes) {
    groups[change.kind].push(change);
  }
  return groups;
}
