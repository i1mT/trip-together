"use client";
import { useState } from "react";
import { SheetForm, SheetFooter, Sheet } from "../ui";
import { Field } from "../editors/fields";
export function PreparationEditor({
  groups,
  existing,
  item,
  onAdd,
  onSave,
  onClose,
  error,
}: {
  groups: string[];
  existing: string[];
  item?: {
    id: string;
    group_name: string;
    title: string;
    note: string;
  };
  onAdd?: (v: {
    group_name: string;
    title: string;
    note: string;
  }) => Promise<boolean>;
  onSave?: (
    id: string,
    v: { group_name: string; title: string; note: string },
  ) => Promise<boolean>;
  onClose: () => void;
  error: string;
}) {
  const [title, setTitle] = useState(item?.title ?? ""),
    [group, setGroup] = useState(item?.group_name ?? groups[0] ?? "出发准备"),
    [note, setNote] = useState(item?.note ?? ""),
    [more, setMore] = useState(!item),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const initial = {
    title: item?.title ?? "",
    group: item?.group_name ?? groups[0] ?? "出发准备",
    note: item?.note ?? "",
  };
  async function submit(name: string) {
    setBusy(true);
    try {
      const value = { group_name: group || "出发准备", title: name, note };
      const saved =
        item && onSave ? await onSave(item.id, value) : await onAdd?.(value);
      if (saved) {
        setTitle("");
        setNote("");
        setNotice(item ? "准备事项已更新" : `已添加：${name}`);
        if (item || !more) onClose();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      hasChanges={
        title !== initial.title ||
        group !== initial.group ||
        note !== initial.note
      }
      open
      title={item ? "编辑准备事项" : "添加准备事项"}
      onClose={() => !busy && onClose()}
    >
      <SheetForm
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(title);
        }}
      >
        <Field
          label="准备事项"
          value={title}
          required
          maxLength={200}
          placeholder="例如：携带充电器"
          onChange={setTitle}
        />
        <details className="optional-details">
          <summary>分组与说明（选填）</summary>
          <div className="optional-fields">
            <label>
              分组
              <input
                aria-label="分组"
                list="preparation-groups"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              />
              <datalist id="preparation-groups">
                {groups.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </datalist>
            </label>
            <Field label="说明" value={note} onChange={setNote} />
          </div>
        </details>
        {!item && (
          <label className="inline-check">
            <input
              type="checkbox"
              checked={more}
              onChange={(e) => setMore(e.target.checked)}
            />
            保存后继续添加
          </label>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <SheetFooter>
          <button className="primary-button" disabled={busy || !title.trim()}>
            {busy
              ? item
                ? "正在保存…"
                : "正在添加…"
              : item
                ? "保存修改"
                : "添加准备事项"}
          </button>
        </SheetFooter>
        {!item && (
          <details className="optional-details">
            <summary>从常用清单快速添加</summary>
            <div className="optional-fields">
              {[
                "检查护照与签证",
                "确认机票与酒店订单",
                "携带充电器与转换插头",
                "准备常用药品",
                "检查行李额度",
              ].map((name) => (
                <button
                  type="button"
                  className="secondary-button"
                  key={name}
                  disabled={busy || existing.includes(name)}
                  onClick={() => void submit(name)}
                >
                  {existing.includes(name) ? "已添加 · " : "＋ "}
                  {name}
                </button>
              ))}
            </div>
          </details>
        )}
      </SheetForm>
    </Sheet>
  );
}
