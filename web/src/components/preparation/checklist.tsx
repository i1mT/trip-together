"use client";
import { useState } from "react";
import { Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import type { PreparationItem } from "@/lib/models";
import { api } from "@/lib/api";
import { SheetFooter, Sheet } from "../ui";
import { EmptyState } from "../empty-state";
import { PreparationEditor } from "./preparation-editor";
import { useToast } from "../toast";
export function PreparationChecklist({
  items,
  checked,
  onRefresh,
}: {
  items: PreparationItem[];
  checked: string[];
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [adding, setAdding] = useState(false),
    [removing, setRemoving] = useState<PreparationItem | null>(null),
    [editing, setEditing] = useState<PreparationItem | null>(null);
  const toast = useToast();
  const completed = items.filter((i) => checked.includes(i.id)).length,
    groups = [...new Set(items.map((i) => i.group_name))];
  async function action(path: string, method: string, body?: object) {
    setBusy(true);
    setError("");
    try {
      await api(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      await onRefresh();
      if (method === "PUT" && path.startsWith("/preparation/"))
        toast("准备事项已更新");
      else if (method === "POST") toast("准备事项已添加");
      else if (method === "DELETE") toast("准备事项已删除");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="preparation-checklist">
      {items.length > 0 && (
        <>
          <div className="preparation-summary">
            <strong>
              已完成 {completed} / {items.length}
            </strong>
            <span>按本人准备情况勾选</span>
          </div>
          <progress
            value={completed}
            max={items.length || 1}
            aria-label="准备进度"
          />
        </>
      )}
      {groups.map((g) => (
        <details className="preparation-group" key={g} open>
          <summary>
            <strong>{g}</strong>
            <ChevronDown size={15} />
          </summary>
          {items
            .filter((i) => i.group_name === g)
            .map((i) => (
              <div className="checklist-row" key={i.id}>
                <button
                  className="preparation-item preparation-check-button"
                  role="checkbox"
                  aria-label={`标记${i.title}`}
                  aria-checked={checked.includes(i.id)}
                  disabled={busy}
                  onClick={() =>
                    void action("/packing", "PUT", {
                      itemId: i.id,
                      checked: !checked.includes(i.id),
                    })
                  }
                >
                  <span
                    className={`checkbox ${checked.includes(i.id) ? "checked" : ""}`}
                  >
                    {checked.includes(i.id) && <Check size={13} />}
                  </span>
                </button>
                <button
                  className={`preparation-item-copy ${checked.includes(i.id) ? "checked" : ""}`}
                  onClick={() => setEditing(i)}
                  aria-label={`编辑${i.title}`}
                >
                  <span>
                    <strong>{i.title}</strong>
                    {i.note && <small>{i.note}</small>}
                  </span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`编辑${i.title}`}
                  onClick={() => setEditing(i)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`删除${i.title}`}
                  onClick={() => setRemoving(i)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
        </details>
      ))}
      {!items.length && (
        <EmptyState
          kind="luggage"
          title="还没有准备事项"
          text="添加需要携带的物品或提前办理的事项，每位成员分别勾选。"
        />
      )}
      <button
        className="secondary-button w-full"
        onClick={() => setAdding(true)}
      >
        添加准备事项
      </button>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {adding && (
        <PreparationEditor
          error={error}
          groups={groups}
          existing={items.map((i) => i.title)}
          onClose={() => setAdding(false)}
          onAdd={(v) => action("/preparation", "POST", v)}
        />
      )}
      {editing && (
        <PreparationEditor
          item={editing}
          groups={groups}
          existing={items.map((i) => i.title)}
          error={error}
          onClose={() => setEditing(null)}
          onSave={async (id, value) => {
            const saved = await action(`/preparation/${id}`, "PUT", value);
            if (saved) setEditing(null);
            return saved;
          }}
        />
      )}
      {removing && (
        <Sheet
          open
          title="删除准备事项"
          onClose={() => !busy && setRemoving(null)}
        >
          <div className="editor-form">
            <p>删除「{removing.title}」及所有成员对此项的勾选记录？</p>
            <SheetFooter>
              <button
                className="danger-button"
                disabled={busy}
                onClick={async () => {
                  if (await action(`/preparation/${removing.id}`, "DELETE"))
                    setRemoving(null);
                }}
              >
                确认删除
              </button>
            </SheetFooter>
          </div>
        </Sheet>
      )}
    </div>
  );
}
