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
} from "lucide-react";
import type { Expense, TripData } from "@/lib/models";
import { currencyLabel, money, settlementOf, splitAmount } from "@/lib/money";
import { api } from "@/lib/api";
import { Avatar } from "../avatar";
import { SheetFooter, Sheet, SheetForm } from "../ui";
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
  const [confirmReverse, setConfirmReverse] = useState(false);
  const [settling, setSettling] = useState(false);
  const [actual, setActual] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = Boolean(expense.settlement_locked);
  const settlement = settlementOf(expense);
  const payer = data.members.find((member) => member.id === expense.payer_id);
  const recorder = data.members.find(
    (member) =>
      member.user_id === expense.created_by || member.id === expense.created_by,
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
      await api(`/expenses/${expense.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: expense.version }),
      });
      await onRefresh();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  async function settle(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d+(\.\d{1,2})?$/.test(actual) || Number(actual) <= 0) {
      setError("请填写大于 0 的实际人民币，最多两位小数");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/expenses/${expense.id}/settle`, {
        method: "POST",
        body: JSON.stringify({
          amountCny: Math.round(Number(actual) * 100),
          version: expense.version,
        }),
      });
      await onRefresh();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "结算失败");
    } finally {
      setBusy(false);
    }
  }
  async function reverse() {
    setBusy(true);
    setError("");
    try {
      await api(`/expenses/${expense.id}/reverse`, {
        method: "POST",
        body: JSON.stringify({ version: expense.version }),
      });
      await onRefresh();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "冲销失败");
    } finally {
      setBusy(false);
    }
  }
  const delta =
    expense.amount_cny_estimated != null && actual
      ? Math.round(Number(actual) * 100) - expense.amount_cny_estimated
      : null;
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
          <p
            className={settlement.approximate ? "amount-estimated" : undefined}
          >
            {settlement.approximate ? "约 " : ""}
            {money(settlement.cents, "CNY")}
            {expense.entry_type === "reversal"
              ? " · 冲销"
              : locked
                ? " · 已结算"
                : settlement.approximate
                  ? " · 待结算"
                  : ""}
            {locked && expense.amount_cny_estimated != null && (
              <small>
                {" "}
                原估算 约 {money(expense.amount_cny_estimated, "CNY")}
              </small>
            )}
          </p>
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
          ) : locked ? (
            <p className="empty-receipt-note">
              <ReceiptText size={18} strokeWidth={1.3} />
              这笔账已锁定，没有付款资料。
            </p>
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
      {settling && (
        <Sheet
          open
          title="录入实际人民币"
          description="录入信用卡实际扣款后，这笔账会被锁定。"
          onClose={() => !busy && setSettling(false)}
          className="expense-confirm-sheet"
        >
          <SheetForm className="settle-form" onSubmit={settle}>
            <p className="muted">
              {expense.title} · {money(expense.amount, expense.currency)}
              {expense.amount_cny_estimated != null && (
                <>
                  {" "}
                  · 记账估算{" "}
                  <s>约 {money(expense.amount_cny_estimated, "CNY")}</s>
                </>
              )}
            </p>
            <label>
              实际人民币
              <input
                required
                aria-label="实际人民币"
                inputMode="decimal"
                value={actual}
                placeholder="0.00"
                onChange={(event) => setActual(event.target.value)}
              />
            </label>
            {delta != null && Number.isFinite(delta) && (
              <p className="muted">
                差额 {delta >= 0 ? "+" : ""}
                {money(delta, "CNY")}
                （手续费/汇率差），将按这笔账的分摊比例计入每个人。
              </p>
            )}
            <SheetFooter>
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <button className="primary-button w-full" disabled={busy}>
                确认并锁定
              </button>
              <button
                type="button"
                className="text-action"
                disabled={busy}
                onClick={() => setSettling(false)}
              >
                取消
              </button>
            </SheetFooter>
          </SheetForm>
        </Sheet>
      )}
      {confirmReverse && (
        <Sheet
          open
          title="冲销重记"
          description="生成一条反向记录，原账保留不变。"
          onClose={() => !busy && setConfirmReverse(false)}
          className="expense-confirm-sheet"
        >
          <div className="companion-confirm-content">
            <p>
              这笔账已经锁定，不能直接编辑或删除。确认后会生成一条等额反向记录，之后可以重新记一笔正确的账。
            </p>
            <p className="confirm-consequence">
              原账和冲销记录都会保留在审计链路中。
            </p>
          </div>
          <SheetFooter>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <button
              className="danger-button w-full"
              disabled={busy}
              onClick={() => void reverse()}
            >
              确认冲销
            </button>
            <button
              className="text-action"
              disabled={busy}
              onClick={() => setConfirmReverse(false)}
            >
              取消
            </button>
          </SheetFooter>
        </Sheet>
      )}
      {confirmDelete && (
        <Sheet
          open
          title="删除支出"
          description="从账本和分摊统计中移除这笔未锁定的支出。"
          onClose={() => !busy && setConfirmDelete(false)}
          className="expense-confirm-sheet"
        >
          <div className="companion-confirm-content">
            <p>删除后，这笔支出及其分摊记录不会再出现在行程账本中。</p>
            <p className="confirm-consequence">
              删除操作不可撤销。已结算的账不能删除，只能冲销重记。
            </p>
          </div>
          <SheetFooter>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <button
              className="danger-button w-full"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "正在删除…" : "确认删除"}
            </button>
            <button
              className="text-action"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              取消
            </button>
          </SheetFooter>
        </Sheet>
      )}
      <SheetFooter className="expense-detail-actions">
        <div className="expense-action-buttons">
          {locked ? (
            <button
              className="danger-button"
              onClick={() => setConfirmReverse(true)}
            >
              冲销重记
            </button>
          ) : (
            <button
              className="danger-button"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={17} />
              删除
            </button>
          )}
          {!locked && settlement.approximate && (
            <button
              className="secondary-button"
              onClick={() => setSettling(true)}
            >
              录入实际人民币
            </button>
          )}
          {!locked && (
            <button
              className="primary-button"
              aria-label="编辑这笔支出"
              onClick={() => onEdit(expense)}
            >
              <Pencil size={17} />
              修改支出
            </button>
          )}
        </div>
      </SheetFooter>
    </Sheet>
  );
}
