"use client";
import { useState } from "react";
import {
  CalendarDays,
  Check,
  Pencil,
  Trash2,
  ReceiptText,
  Users,
  Info,
  LoaderCircle,
} from "lucide-react";
import type { Expense, TripData } from "@/lib/models";
import { currencyLabel, money, splitAmount } from "@/lib/money";
import { api } from "@/lib/api";
import { Avatar } from "../avatar";
import { SheetFooter, Sheet } from "../ui";
import { FileTiles } from "../files/file-tiles";
export function ExpenseDetail({
  expense,
  data,
  onClose,
  onEdit,
  onRefresh,
}: {
  expense: Expense;
  data: TripData;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onRefresh: () => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);
  const payer = data.members.find((member) => member.id === expense.payer_id);
  const recorder = data.members.find(
    (member) => member.id === expense.created_by,
  );
  const shares = splitAmount(expense.amount, expense.participants);
  const participants = data.members.filter((member) =>
    expense.participants.includes(member.id),
  );
  const files = [
    ...data.receipts.filter((file) => file.expense_id === expense.id),
    ...data.documents.filter((file) => file.id === expense.source_document_id),
  ];
  async function remove() {
    setBusy(true);
    setError("");
    try {
      if (!deleted) {
        await api(`/expenses/${expense.id}`, {
          method: "DELETE",
          body: JSON.stringify({ version: expense.version }),
        });
        setDeleted(true);
      }
      await onRefresh();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      title="支出详情"
      onClose={() => !busy && onClose()}
      className="expense-detail-sheet"
    >
      <div className="expense-detail-content">
        <article className="paid-receipt">
          <div className="paid-receipt-top">
            <span>
              <Check size={13} />
              已记录
            </span>
            <ReceiptText size={25} strokeWidth={1.4} />
          </div>
          <h3>{expense.title}</h3>
          <div className="paid-amount">
            {money(expense.amount, expense.currency)}
            <small>{currencyLabel(expense.currency)}</small>
          </div>
          <div className="paid-receipt-meta">
            <span>
              <CalendarDays size={14} />
              {expense.date.replaceAll("-", ".")}
            </span>
            <span>{currencyLabel(expense.currency)}</span>
          </div>
          <div className="paid-by">
            <Avatar member={payer} />
            <div>
              <small>付款人</small>
              <strong>{payer?.name}</strong>
            </div>
            {recorder && <span>{recorder.name}记录</span>}
          </div>
        </article>
        <section className="expense-share-section">
          <div className="expense-detail-heading">
            <h3>
              <Users size={17} />
              费用分摊
            </h3>
            <span>{participants.length} 人均分</span>
          </div>
          <div className="expense-share-grid">
            {participants.map((member) => (
              <div className="expense-share-member" key={member.id}>
                <Avatar member={member} />
                <span>{member.name}</span>
                <strong>{money(shares[member.id], expense.currency)}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="expense-files-section">
          <div className="expense-detail-heading">
            <h3>
              <ReceiptText size={17} />
              付款资料
            </h3>
            <span>{files.length} 份</span>
          </div>
          {files.length ? (
            <FileTiles
              files={files.map((file) => ({
                ...file,
                url: `/api/files/${file.id}`,
              }))}
            />
          ) : (
            <button
              className="empty-receipt-action"
              onClick={() => onEdit(expense)}
            >
              <ReceiptText size={24} strokeWidth={1.3} />
              <span>
                尚未添加资料<small>点击添加图片或 PDF</small>
              </span>
              <Pencil size={15} />
            </button>
          )}
        </section>
        {expense.note && (
          <details className="expense-original-note">
            <summary>
              <Info size={14} />
              原始记录说明
            </summary>
            <p>{expense.note}</p>
          </details>
        )}
      </div>
      <SheetFooter className="expense-detail-actions">
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {confirmDelete ? (
          <div
            className="expense-delete-confirm"
            role="group"
            aria-label="删除确认"
          >
            <p>
              {deleted
                ? "记录已删除，点击重试刷新账本。"
                : "确定删除这笔支出吗？"}
              <small>删除后会从账本和分摊统计中移除。</small>
            </p>
            <div>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  if (deleted) onClose();
                  else {
                    setConfirmDelete(false);
                    setError("");
                  }
                }}
              >
                {deleted ? "关闭" : "取消"}
              </button>
              <button
                className="confirm-expense-delete"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                {deleted ? "重试刷新" : "确认删除"}
              </button>
            </div>
          </div>
        ) : (
          <div className="expense-action-buttons">
            <button
              className="danger-button"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={17} />
              删除
            </button>
            <button
              className="primary-button"
              aria-label="编辑这笔支出"
              onClick={() => onEdit(expense)}
            >
              <Pencil size={17} />
              修改支出
            </button>
          </div>
        )}
      </SheetFooter>
    </Sheet>
  );
}
