"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ShieldCheck,
  ChevronRight,
  FileText,
  RotateCw,
  X,
  LoaderCircle,
} from "lucide-react";
import type { TripData, TripDocument } from "@/lib/models";
import type { FileTile } from "../files/file-tiles";
import { DocumentRow, DocumentPreview } from "../views/documents";
import { uploadFile, validateFiles } from "@/lib/files/upload";
import { api } from "@/lib/api";
import { SheetFooter, Sheet } from "../ui";
export function PersonalDocuments({
  data,
  onRefresh,
  onDocument,
  heading = true,
}: {
  data: Pick<TripData, "me" | "documents">;
  onRefresh: () => Promise<void>;
  onDocument: (doc: TripDocument) => void;
  heading?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<(FileTile & { file: File }) | null>(null);
  const [preview, setPreview] = useState<(FileTile & { file: File }) | null>(
    null,
  );
  const [error, setError] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const url = draft?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [draft?.url]);
  const busy = draft?.status === "uploading";
  const own = data.documents.filter((doc) => doc.owner_id === data.me.id);
  const photos = own.filter((doc) => doc.category === "个人证件");
  async function upload(item: FileTile & { file: File }) {
    setError("");
    setDraft({ ...item, status: "uploading", progress: 0 });
    try {
      await uploadFile(
        `/api/personal-documents/${item.id}`,
        item.file,
        (progress) => setDraft({ ...item, status: "uploading", progress }),
      ).promise;
      await onRefresh();
      setPreview((current) =>
        current?.id === item.id
          ? { ...current, url: `/api/files/${item.id}` }
          : current,
      );
      URL.revokeObjectURL(item.url);
      setDraft(null);
    } catch (e) {
      setDraft({ ...item, status: "error", error: (e as Error).message });
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (!removeId) return;
    setDeleting(true);
    setError("");
    try {
      await api(`/personal-documents/${removeId}`, { method: "DELETE" });
      await onRefresh();
      setRemoveId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="personal-documents">
      {heading && (
        <div className="section-heading">
          <h2>我的证件与文件</h2>
          <span className="personal-private">
            <ShieldCheck size={13} />
            仅本人可见
          </span>
        </div>
      )}
      <div className="surface personal-files-card">
        <input
          hidden
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-label="上传个人证件"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              validateFiles([file], true);
              if (draft) URL.revokeObjectURL(draft.url);
              void upload({
                id: `personal-${crypto.randomUUID()}`,
                name: file.name,
                mime: file.type,
                size: file.size,
                file,
                url: URL.createObjectURL(file),
              });
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        />
        <div className="document-row personal-add-row">
          <button
            className="document-main"
            aria-label="添加证件或文件"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <span className="file-icon">
              <Plus size={22} strokeWidth={1.5} />
            </span>
            <span>
              <strong>添加证件或文件</strong>
              <small>图片 / PDF · 每份 ≤10 MB</small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
        {draft && !photos.some((doc) => doc.id === draft.id) && (
          <div className="document-row personal-draft-row">
            <button
              className="document-main"
              aria-label={`查看${draft.name}`}
              onClick={() => setPreview(draft)}
            >
              <span
                className={`file-icon ${draft.mime.startsWith("image/") ? "file-thumbnail" : ""}`}
              >
                {draft.mime.startsWith("image/") ? (
                  <img src={draft.url} alt="" />
                ) : (
                  <FileText size={22} strokeWidth={1.5} />
                )}
              </span>
              <span>
                <strong>{draft.name}</strong>
                <small role="status" className="personal-upload-status">
                  {busy ? (
                    <>
                      <LoaderCircle className="animate-spin" size={11} />
                      上传中 {draft.progress ?? 0}%
                    </>
                  ) : (
                    "上传失败，请重试"
                  )}
                </small>
                {busy && (
                  <progress
                    aria-label="证件上传进度"
                    value={draft.progress ?? 0}
                    max={100}
                  />
                )}
              </span>
            </button>
            {!busy && (
              <>
                <button
                  className="icon-button"
                  aria-label="重试上传证件"
                  onClick={() => void upload(draft)}
                >
                  <RotateCw size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`移除${draft.name}`}
                  onClick={() => {
                    setPreview(null);
                    setDraft(null);
                  }}
                >
                  <X size={17} />
                </button>
              </>
            )}
          </div>
        )}
        {own.map((doc) => (
          <DocumentRow
            key={doc.id}
            doc={doc}
            onOpen={onDocument}
            onRemove={
              doc.category === "个人证件"
                ? () => setRemoveId(doc.id)
                : undefined
            }
          />
        ))}
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <DocumentPreview
          doc={{ ...preview, category: "个人证件", owner_id: data.me.id }}
          sourceUrl={preview.url}
          onClose={() => setPreview(null)}
        />
      )}
      {removeId && (
        <Sheet
          open
          title="删除证件图片"
          onClose={() => !deleting && setRemoveId(null)}
        >
          <div className="personal-delete">
            <p>确定删除这份证件图片吗？</p>
            <SheetFooter>
              <button
                className="danger-button w-full"
                disabled={deleting}
                onClick={() => void remove()}
              >
                确认删除证件
              </button>
            </SheetFooter>
          </div>
        </Sheet>
      )}
    </div>
  );
}
