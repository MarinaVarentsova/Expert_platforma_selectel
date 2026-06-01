import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ChevronDown, Check, X } from "lucide-react";

type Region = { id: string; name: string };

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
}

export function RegionMultiSelect({
  selectedIds,
  onChange,
  max,
  placeholder = "Выберите регионы…",
  disabled,
  hasError,
}: Props) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("palata_regions")
      .select("id, name")
      .order("sort_order")
      .order("name")
      .then(({ data }) => setRegions(data ?? []));
  }, []);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      if (max && selectedIds.length >= max) return;
      onChange([...selectedIds, id]);
    }
  }

  const filtered = regions.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedRegions = selectedIds
    .map((id) => regions.find((r) => r.id === id))
    .filter(Boolean) as Region[];

  return (
    <div className="space-y-2">
      <div className="relative" ref={ref}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={`w-full text-sm border rounded-xl px-3 py-2.5 bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A] hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            hasError ? "border-red-400" : "border-slate-200"
          }`}
        >
          <span className={selectedIds.length === 0 ? "text-slate-400" : "text-[#111111]"}>
            {selectedIds.length === 0
              ? placeholder
              : `Выбрано регионов: ${selectedIds.length}`}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск региона…"
                autoFocus
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C9A]/30 focus:border-[#0F4C9A]"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.map((r) => {
                const sel = selectedIds.includes(r.id);
                const maxReached = !sel && !!max && selectedIds.length >= max;
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={maxReached}
                    onClick={() => toggle(r.id)}
                    className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                      maxReached
                        ? "opacity-40 cursor-not-allowed"
                        : sel
                          ? "bg-[#F0F4FF] text-[#002B5C]"
                          : "hover:bg-[#F4F4F4] text-[#111111]"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        sel ? "bg-[#002B5C] border-[#002B5C]" : "border-slate-300"
                      }`}
                    >
                      {sel && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    {r.name}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">
                  Ничего не найдено
                </p>
              )}
            </div>
            {max && selectedIds.length >= max && (
              <div className="px-3 py-2 border-t border-slate-100 bg-amber-50">
                <p className="text-[11px] text-amber-700">
                  Выбрано максимальное количество регионов ({max})
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedRegions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedRegions.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1 text-xs bg-[#002B5C] text-white px-2.5 py-1 rounded-full"
            >
              {r.name}
              <button
                type="button"
                onClick={() => toggle(r.id)}
                disabled={disabled}
                className="hover:opacity-70 transition-opacity ml-0.5 disabled:cursor-not-allowed"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
