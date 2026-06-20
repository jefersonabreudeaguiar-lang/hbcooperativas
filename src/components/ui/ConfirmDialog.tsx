"use client";

import { Modal } from "./Table";
import { Button } from "./Button";
import { FormField, Textarea } from "./Form";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "primary",
  loading,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
        <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
        <Button variant={variant === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

interface PromptDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  label: string;
  placeholder?: string;
  confirmLabel?: string;
  suggestions?: string[];
  value: string;
  onChange: (v: string) => void;
}

export function PromptDialog({
  open,
  onClose,
  onConfirm,
  title,
  label,
  placeholder,
  confirmLabel = "Confirmar",
  suggestions,
  value,
  onChange,
}: PromptDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <FormField label={label} required>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} />
      </FormField>
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" onClick={() => onConfirm(value)} disabled={!value.trim()}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
