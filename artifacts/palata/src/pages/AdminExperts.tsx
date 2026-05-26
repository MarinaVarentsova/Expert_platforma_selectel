import AdminLayout from "@/components/AdminLayout";

export default function AdminExperts() {
  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Эксперты</h1>
          <p className="text-sm text-slate-500 mt-1">Управление профилями и верификацией экспертов</p>
        </div>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-500 mb-1">Раздел в разработке</p>
          <p className="text-xs text-slate-400">Здесь будет список экспертов с фильтрацией, верификацией и управлением профилями</p>
        </div>
      </div>
    </AdminLayout>
  );
}
