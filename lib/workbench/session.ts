import { commit, emptyHistory, redo, undo, type History } from './project.ts';
import { followRoutes } from './edit.ts';
import type { Workbench } from './types.ts';
export type Session = { workbench: Workbench; history: History };
export type Action =
  | {
      type: 'edit';
      label: string;
      change: (w: Workbench) => Workbench;
      coalesce?: boolean;
    }
  | { type: 'load'; workbench: Workbench }
  | { type: 'history'; change: (h: History) => History }
  | { type: 'undo' | 'redo' };
export const initialSession = (workbench: Workbench): Session => ({
  workbench,
  history: emptyHistory(),
});
export function sessionReducer(s: Session, a: Action): Session {
  if (a.type === 'load') return initialSession(a.workbench);
  if (a.type === 'history') return { ...s, history: a.change(s.history) };
  if (a.type === 'undo' || a.type === 'redo')
    return (a.type === 'undo' ? undo : redo)(s.history, s.workbench) ?? s;
  if (a.type === 'edit') {
    const next = a.change(s.workbench);
    if (next === s.workbench) return s;
    return {
      workbench: followRoutes(s.workbench, next),
      history: commit(s.history, s.workbench, a.label, a.coalesce),
    };
  }
  return s;
}
