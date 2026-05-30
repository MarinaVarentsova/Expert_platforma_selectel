import { ReactNode } from "react";
import { Inbox } from "lucide-react";

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
    dotColor: string;
    bgColor: string;
    items: T[];
  }>;
  renderCard: (item: T) => ReactNode;
  emptyText?: string;
};

export function KanbanBoard<T>({ columns, renderCard, emptyText = "Нет заявок" }: KanbanBoardProps<T>) {
  return (
    <div className="flex flex-col md:flex-row gap-3 overflow-x-auto pb-4 -mx-1 px-1" style={{ minHeight: "420px" }}>
      {columns.map((col) => (
        <div key={col.id} className="w-full md:flex-1 md:min-w-48 md:max-w-xs lg:max-w-none flex flex-col">

          {/* Column header */}
          <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl border border-b-0 ${col.bgColor}`}>
            <div className="flex items-center gap-2">
              <span className={`status-dot ${col.dotColor}`} />
              <span className="text-xs font-semibold text-slate-700">{col.label}</span>
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              col.items.length > 0
                ? "bg-white text-slate-700 shadow-sm"
                : "bg-slate-100/60 text-slate-400"
            }`}>
              {col.items.length}
            </span>
          </div>

          {/* Column body */}
          <div className="flex-1 border border-t-0 border-[#d4e5d9] rounded-b-xl bg-[#f7fbf8]/80 p-2 flex flex-col gap-2">
            {col.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-40">
                <Inbox className="w-6 h-6 text-[#8aaa90]" />
                <p className="text-xs text-[#8aaa90] text-center">{emptyText}</p>
              </div>
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
