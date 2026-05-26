import { ReactNode } from "react";

export type KanbanColumnDef<T> = {
  id: string;
  label: string;
  accent: string;
  keys: string[];
  getKey: (item: T) => string;
};

type KanbanBoardProps<T> = {
  columns: Array<{
    id: string;
    label: string;
    accent: string;
    items: T[];
  }>;
  renderCard: (item: T) => ReactNode;
  emptyText?: string;
};

export function KanbanBoard<T>({ columns, renderCard, emptyText = "Пусто" }: KanbanBoardProps<T>) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "420px" }}>
      {columns.map((col) => (
        <div key={col.id} className="flex-shrink-0 w-64 flex flex-col">
          {/* Column header */}
          <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border-t-2 border-x border-slate-200 bg-white ${col.accent}`}>
            <span className="text-xs font-semibold text-slate-700 truncate">{col.label}</span>
            <span className="ml-2 text-xs font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">
              {col.items.length}
            </span>
          </div>

          {/* Cards */}
          <div className="flex-1 border-x border-b border-slate-200 rounded-b-lg bg-slate-50 p-2 flex flex-col gap-2">
            {col.items.length === 0 ? (
              <p className="text-xs text-slate-300 text-center mt-4">{emptyText}</p>
            ) : (
              col.items.map((item, i) => (
                <div key={i}>{renderCard(item)}</div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
