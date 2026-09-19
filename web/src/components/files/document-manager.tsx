"use client";
import { track } from "@/lib/analytics/client";
import { useRef, useState } from "react";
import type { TripDocument } from "@/lib/models";
import { api, apiUrl } from "@/lib/api";
import { uploadFile } from "@/lib/files/upload";
import { SheetForm, SheetFooter, Sheet } from "../ui";
import { CategorySelect } from "./category-select";
import { UploadGrid, type UploadItem } from "./upload-grid";
import { useToast } from "../toast";
export function DocumentUpload({
  onClose,
  onSaved,
  onUploaded,
  category: initialCategory = "行程",
  categories = [],
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  onUploaded?: (docs: TripDocument[]) => void;
  category?: string;
  categories?: string[];
}) {
  const toast = useToast();
  const [items, setItems] = useState<UploadItem[]>([]),
    [category, setCategory] = useState(initialCategory),
    [privateFile, setPrivate] = useState(false),
    [started, setStarted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [active, setActive] = useState("");
  const cancel = useRef<(() => void) | null>(null),
    cancelled = useRef(false);
  const locked = started,
    remaining = items.filter((i) => !i.done);
  function update(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!category.trim()) {
      setError("请选择或输入资料分类");
      return;
    }
    if (!started) track("document_upload_started", "documents");
    cancelled.current = false;
    setStarted(true);
    setBusy(true);
    setError("");
    let failed = false;
    for (const item of remaining) {
      if (cancelled.current) {
        failed = true;
        break;
      }
      setActive(item.id);
      update(item.id, { error: "", progress: 0 });
      try {
        const task = uploadFile(
          apiUrl(
            `/documents/${item.id}?category=${encodeURIComponent(category.trim())}&private=${privateFile ? 1 : 0}`,
          ),
          item.file,
          (progress) => update(item.id, { progress }),
        );
        cancel.current = task.abort;
        await task.promise;
        update(item.id, { done: true });
        onUploaded?.([
          {
            id: item.id,
            name: item.file.name,
            category,
            owner_id: privateFile ? "self" : null,
            mime: item.file.type,
            size: item.file.size,
          },
        ]);
      } catch (e) {
        failed = true;
        update(item.id, { error: (e as Error).message });
      }
    }
    try {
      await onSaved();
      if (!failed) {
        toast("资料已上传");
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setActive("");
      cancel.current = null;
    }
  }
  return (
    <Sheet
      hasChanges={remaining.length > 0}
      open
      title="上传旅行资料"
      className="document-upload-sheet"
      onClose={() => !busy && onClose()}
    >
      <SheetForm className="editor-form" onSubmit={save}>
        <CategorySelect
          value={category}
          categories={categories}
          disabled={busy || locked}
          onChange={setCategory}
        />
        <UploadGrid
          items={items}
          busy={busy}
          active={active}
          onAdd={(files) =>
            setItems((prev) => [
              ...prev,
              ...files.map((file) => ({
                id: crypto.randomUUID(),
                file,
                progress: 0,
                done: false,
                error: "",
              })),
            ])
          }
          onRemove={(id) =>
            setItems((prev) => prev.filter((item) => item.id !== id))
          }
        />
        <details className="upload-visibility">
          <summary>
            可见范围：{privateFile ? "仅自己可见" : "同行成员可见"}
          </summary>
          <div
            role="group"
            aria-label="谁可以查看"
            className="segmented-choice"
          >
            {[
              [false, "同行成员可见"],
              [true, "仅自己可见"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={String(value)}
                disabled={busy || locked}
                aria-pressed={privateFile === value}
                onClick={() => setPrivate(Boolean(value))}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="muted">
            {privateFile
              ? "只有你能查看这些文件。"
              : "当前行程的同行成员可以查看，请勿上传私人证件。"}
          </p>
        </details>
        <SheetFooter>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          {busy && (
            <button
              type="button"
              className="text-action"
              onClick={() => {
                cancelled.current = true;
                cancel.current?.();
              }}
            >
              暂停上传
            </button>
          )}
          <button className="primary-button" disabled={busy || !items.length}>
            {busy
              ? "正在上传…"
              : remaining.length
                ? items.some((i) => i.error)
                  ? "重试未完成的文件"
                  : `上传 ${remaining.length} 份资料`
                : "完成"}
          </button>
        </SheetFooter>
      </SheetForm>
    </Sheet>
  );
}
export function DeleteDocument({
  doc,
  onClose,
  onSaved,
}: {
  doc: TripDocument;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Sheet open title="删除旅行资料" onClose={() => !busy && onClose()}>
      <div className="editor-form">
        <p>确认删除「{doc.name}」？相关事项将不再关联这份文件。</p>
        {error && <p role="alert">{error}</p>}
        <SheetFooter>
          <button
            className="danger-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/documents/${doc.id}`, { method: "DELETE" });
                await onSaved();
                toast("资料已删除");
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            确认删除资料
          </button>
        </SheetFooter>
      </div>
    </Sheet>
  );
}
