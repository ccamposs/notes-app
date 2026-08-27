import { FileText, ListTodo, Calendar, Briefcase, ShoppingCart, BookOpen } from 'lucide-react';

export interface NoteTemplate {
  id: string;
  name: string;
  icon: typeof FileText;
  title: string;
  content: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'blank',
    name: 'Em branco',
    icon: FileText,
    title: '',
    content: '',
  },
  {
    id: 'meeting',
    name: 'Reunião',
    icon: Calendar,
    title: 'Reunião - ',
    content: '<h2>Participantes</h2><ul><li></li></ul><h2>Pauta</h2><ul><li></li></ul><h2>Decisões</h2><ul><li></li></ul><h2>Próximos passos</h2><ul><li></li></ul>',
  },
  {
    id: 'todo',
    name: 'Lista de tarefas',
    icon: ListTodo,
    title: 'Tarefas - ',
    content: '<h2>A fazer</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false">Tarefa 1</li><li data-type="taskItem" data-checked="false">Tarefa 2</li><li data-type="taskItem" data-checked="false">Tarefa 3</li></ul><h2>Notas</h2><p></p>',
  },
  {
    id: 'project',
    name: 'Projeto',
    icon: Briefcase,
    title: 'Projeto - ',
    content: '<h2>Objetivo</h2><p></p><h2>Requisitos</h2><ul><li></li></ul><h2>Cronograma</h2><ul><li></li></ul><h2>Recursos necessários</h2><ul><li></li></ul><h2>Riscos</h2><ul><li></li></ul>',
  },
  {
    id: 'shopping',
    name: 'Lista de compras',
    icon: ShoppingCart,
    title: 'Compras - ',
    content: '<h2>Supermercado</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"></li></ul><h2>Outros</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"></li></ul>',
  },
  {
    id: 'diary',
    name: 'Diário',
    icon: BookOpen,
    title: new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    content: '<h2>Como estou hoje</h2><p></p><h2>O que aconteceu</h2><p></p><h2>Gratidão</h2><ul><li></li></ul><h2>Planos para amanhã</h2><p></p>',
  },
];

interface Props {
  onSelect: (template: NoteTemplate) => void;
  onClose: () => void;
}

export default function NoteTemplates({ onSelect, onClose }: Props) {
  return (
    <div className="templates-overlay" onClick={onClose}>
      <div className="templates-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Criar nota a partir de template</h3>
        <div className="templates-grid">
          {NOTE_TEMPLATES.map((template) => {
            const Icon = template.icon;
            return (
              <button
                key={template.id}
                className="template-card"
                onClick={() => onSelect(template)}
              >
                <Icon size={24} />
                <span>{template.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
