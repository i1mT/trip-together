"use client";
import { MemberSelect } from "./members/member-select";
import { AddCompanion } from "./members/add-companion";
import { Avatar } from "./avatar";
import { useMemo, useState } from "react";
import { LoaderCircle, Check, Trash2, ArrowRightLeft } from "lucide-react";
import type { Currency, Expense, Member, TripData } from "@/lib/models";
import { ReceiptPicker, useReceipts } from "./ledger/receipt-picker";
import { localDate, selectEvents } from "@/lib/time";
import {
  currencyLabel,
  estimateCny,
  formatRate,
  money,
  referencePpm,
  referenceRateDate,
  selfMemberId,
  splitAmount,
} from "@/lib/money";
import { api } from "@/lib/api";
import { SheetForm, SheetFooter, Sheet } from "./ui";
import { DateTimeWheelField } from "./editors/fields";
import { useToast } from "./toast";
export function ExpenseEditor({
  expense,
  data,
  onClose,
  onSaved,
}: {
  expense: Expense | null;
  data: TripData;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const locked = Boolean(expense?.settlement_locked);
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(
    expense ? (expense.amount / 100).toFixed(2) : "",
  );
  const [currency, setCurrency] = useState<Currency>(
    expense?.currency ?? data.trip.currency,
  );
  const [extraMembers, setExtraMembers] = useState<Member[]>([]);
  const [adding, setAdding] = useState<"payer" | "share" | null>(null);
  const members = useMemo(() => {
    const known = new Set(data.members.map((member) => member.id));
    return [
      ...data.members,
      ...extraMembers.filter((member) => !known.has(member.id)),
    ];
  }, [data.members, extraMembers]);
  const selfId = selfMemberId(members, data.me.id);
  const [payerId, setPayerId] = useState(expense?.payer_id ?? selfId);
  const [estimate, setEstimate] = useState(
    expense?.amount_cny_estimated != null
      ? (expense.amount_cny_estimated / 100).toFixed(2)
      : "",
  );
  const receipts = useReceipts(
    data.receipts.filter((r) => r.expense_id === expense?.id),
  );
  function close() {
    onClose();
  }
  const [date, setDate] = useState(
    expense?.date ??
      localDate(
        new Date(),
        selectEvents(data.events, Date.now()).featured?.timezone ??
          data.trip.timezone,
      ),
  );
  const [participants, setParticipants] = useState(
    expense?.participants ?? members.map((member) => member.id),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false);
  const [id] = useState(() => crypto.randomUUID());
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      setError("请填写大于 0 的金额，最多两位小数");
      return;
    }
    if (!payerId) {
      setError("请选择实际付款人");
      return;
    }
    if (!participants.length) {
      setError("至少选择一位分摊成员");
      return;
    }
    setBusy(true);
    try {
      const receiptIds = await receipts.upload();
      const cents = Math.round(Number(amount) * 100);
      const estimated =
        currency === "CNY"
          ? undefined
          : Math.round(
              Number(
                estimate ||
                  (estimateCny(cents, referencePpm(currency)) / 100).toFixed(2),
              ) * 100,
            );
      await api(`/expenses${expense ? `/${expense.id}` : ""}`, {
        method: expense ? "PUT" : "POST",
        body: JSON.stringify({
          id,
          title,
          amount: cents,
          currency,
          payerId,
          receiptIds,
          date,
          participants,
          note: expense?.note ?? "",
          version: expense?.version,
          amountCnyEstimated: estimated,
        }),
      });
      await onSaved();
      toast(expense ? "支出已更新" : "支出已记录");
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!expense) return;
    setBusy(true);
    setError("");
    try {
      await api(`/expenses/${expense.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: expense.version }),
      });
      await onSaved();
      toast("支出已删除");
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onClose={() => !busy && close()}
      title={expense ? "编辑支出" : "新增支出"}
      className="expense-sheet"
    >
      <SheetForm className="expense-form" onSubmit={save}>
        <div className="amount-entry">
          <label>
            金额
            <input
              required
              aria-label="金额"
              inputMode="decimal"
              value={amount}
              disabled={locked}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <button
            type="button"
            className="expense-currency-choice"
            disabled={
              locked || busy || data.trip.currency === data.trip.home_currency
            }
            aria-label={`当前币种：${currencyLabel(currency)}${data.trip.currency !== data.trip.home_currency ? `，切换为${currencyLabel(currency === data.trip.currency ? data.trip.home_currency : data.trip.currency)}` : ""}`}
            onClick={() => {
              setCurrency(
                currency === data.trip.currency
                  ? data.trip.home_currency
                  : data.trip.currency,
              );
              setEstimate("");
            }}
          >
            {currencyLabel(currency)}
            {data.trip.currency !== data.trip.home_currency && (
              <ArrowRightLeft size={15} aria-hidden="true" />
            )}
          </button>
        </div>
        {currency !== "CNY" && (
          <div className="estimate-entry">
            <label>
              估算人民币
              <input
                aria-label="估算人民币"
                inputMode="decimal"
                disabled={locked}
                value={
                  estimate ||
                  (
                    estimateCny(
                      Math.round(Number(amount || 0) * 100),
                      referencePpm(currency),
                    ) / 100
                  ).toFixed(2)
                }
                onChange={(event) => setEstimate(event.target.value)}
              />
            </label>
            <p className="muted">
              参考汇率 1 {currencyLabel(currency)} ≈ ¥
              {formatRate(referencePpm(currency))}（{referenceRateDate}{" "}
              参考价，可改）。账单出来后再录入实际人民币。
            </p>
          </div>
        )}
        {currency === "CNY" && (
          <p className="muted">人民币支出按实际金额计入结算，之后仍可修改。</p>
        )}
        {locked && (
          <p className="muted">这笔账的金额已锁定。如需更正，请冲销后重记。</p>
        )}
        <label>
          支出名称
          <input
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：晚餐"
          />
        </label>
        <div className="form-columns">
          <div className="member-field">
            <span>付款人</span>
            <MemberSelect
              label="付款人"
              members={members}
              value={payerId}
              onChange={setPayerId}
              disabled={busy || locked}
              onAdd={locked ? undefined : () => setAdding("payer")}
              stopEscapePropagation
            />
          </div>
          <DateTimeWheelField
            label="支付日期"
            mode="date"
            value={date}
            onChange={setDate}
          />
        </div>
        <fieldset>
          <legend>
            分摊成员 <span>按人数均分</span>
          </legend>
          <div className="form-actions">
            <button
              type="button"
              className="text-action"
              onClick={() => setParticipants(members.map((m) => m.id))}
            >
              全部成员
            </button>
            <button
              type="button"
              className="text-action"
              onClick={() => setParticipants([selfId])}
            >
              仅自己
            </button>
          </div>
          <div className="participant-grid">
            {members.map((m) => (
              <button
                type="button"
                className={`participant ${participants.includes(m.id) ? "checked" : ""}`}
                key={m.id}
                aria-label={m.name}
                aria-pressed={participants.includes(m.id)}
                disabled={locked}
                onClick={() =>
                  setParticipants((p) =>
                    p.includes(m.id)
                      ? p.filter((id) => id !== m.id)
                      : [...p, m.id],
                  )
                }
              >
                <Avatar member={m} />
                <span>{m.name}</span>
                {participants.includes(m.id) && Number(amount) > 0 && (
                  <small>
                    {money(
                      splitAmount(
                        Math.round(Number(amount) * 100),
                        participants,
                      )[m.id],
                      currency,
                    )}
                  </small>
                )}
                {participants.includes(m.id) && <Check size={15} />}
              </button>
            ))}
          </div>
          <p className="muted">
            {participants.length
              ? `共 ${participants.length} 人分摊，按实际金额平均分配。`
              : "请选择至少一位分摊成员。"}
          </p>
          {!locked && (
            <button
              type="button"
              className="add-companion-row"
              onClick={() => setAdding("share")}
            >
              ＋ 添加同伴（只填昵称，无需注册）
            </button>
          )}
        </fieldset>
        <ReceiptPicker receipts={receipts} disabled={busy} onError={setError} />
        <SheetFooter>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <button
            className="primary-button w-full"
            disabled={busy || receipts.uploading}
          >
            {receipts.uploading ? (
              <>资料上传中…</>
            ) : busy ? (
              <LoaderCircle className="animate-spin" size={18} />
            ) : (
              <>
                <Check size={18} />
                {expense ? "保存修改" : "保存支出"}
              </>
            )}
          </button>
          {expense &&
            !locked &&
            (confirmDelete ? (
              <div className="delete-confirm">
                <p>确定删除这笔支出吗？删除后无法撤销。</p>
                <button type="button" disabled={busy} onClick={remove}>
                  确认删除
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)}>
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="danger-button"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} />
                删除这笔支出
              </button>
            ))}
        </SheetFooter>
      </SheetForm>
      <AddCompanion
        open={adding !== null}
        members={members}
        onClose={() => setAdding(null)}
        onPick={(member) => {
          if (adding === "payer") setPayerId(member.id);
          setParticipants((current) =>
            current.includes(member.id) ? current : [...current, member.id],
          );
        }}
        onCreated={(member) => {
          setExtraMembers((current) => [...current, member]);
          if (adding === "payer") setPayerId(member.id);
          setParticipants((current) => [...current, member.id]);
          toast(`已添加${member.name}（未注册），账可以随时认领`);
        }}
        stopEscapePropagation
      />
    </Sheet>
  );
}
