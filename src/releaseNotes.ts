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

export function findReleaseNote(version: string): ReleaseNote | null {
  if (!version) return null;
  const target = normalizeVersion(version);
  const exact = RELEASE_NOTES.find((n) => n.version === target);
  if (exact) return exact;
  return RELEASE_NOTES.find((n) => compareVersions(n.version, target) <= 0) || null;
}

export function getPreviousReleaseNotes(version: string): ReleaseNote[] {
  const current = findReleaseNote(version);
  if (!current) return RELEASE_NOTES;
  return RELEASE_NOTES.filter((n) => compareVersions(n.version, current.version) < 0);
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
