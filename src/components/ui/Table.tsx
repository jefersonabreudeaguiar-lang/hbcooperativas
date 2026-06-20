"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: ReactNode;
}

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({ open, onClose, title, children, size = "md", footer }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full ${SIZES[size]} max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 pr-4">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 shrink-0">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
        {footer && (
          <div className="shrink-0 px-5 py-4 border-t border-gray-200 bg-gray-50">{footer}</div>
        )}
      </div>
    </div>
  );
}

interface DataTableProps<T> {
  columns: { key: string; label: string; render?: (item: T) => ReactNode }[];
  data: T[];
  keyField: keyof T;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  onView?: (item: T) => void;
  emptyMessage?: string;
  mobileCard?: (item: T) => ReactNode;
  viewLabel?: string;
}

export function DataTable<T extends object>({
  columns,
  data,
  keyField,
  onEdit,
  onDelete,
  onView,
  emptyMessage = "Nenhum registro encontrado.",
  mobileCard,
  viewLabel = "Ver",
}: DataTableProps<T>) {
  const hasActions = onEdit || onDelete || onView;

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 border border-gray-200 rounded-lg bg-white">
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  if (mobileCard) {
    return (
      <>
        <div className="md:hidden space-y-3">
          {data.map((item) => (
            <div key={String(item[keyField])}>{mobileCard(item)}</div>
          ))}
        </div>
        <div className="hidden md:block">{renderTable()}</div>
      </>
    );
  }

  return renderTable();

  function renderTable() {
    return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                {col.label}
              </th>
            ))}
            {hasActions && (
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Ações</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((item) => (
              <tr key={String(item[keyField])} className="hover:bg-gray-50 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-gray-700">
                    {col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? "-")}
                  </td>
                ))}
                {hasActions && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {onView && (
                        <Button variant="ghost" size="sm" onClick={() => onView(item)}>{viewLabel}</Button>
                      )}
                      {onEdit && (
                        <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>Editar</Button>
                      )}
                      {onDelete && (
                        <Button variant="ghost" size="sm" onClick={() => onDelete(item)} className="text-red-600 hover:text-red-700 hover:bg-red-50">Excluir</Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
    );
  }
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4">
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-gray-500">
      <p>{message}</p>
    </div>
  );
}
