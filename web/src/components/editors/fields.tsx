"use client";
import {
  currencies,
  currencyNames,
  destinations,
  readableZone,
} from "../../../../shared/travel-options";
import { useId, useState } from "react";
import { Select } from "antd";
import { DatePicker } from "antd-mobile";
import dayjs from "dayjs";
// Radix sheet 是 modal:body 下其他元素的指针事件会被禁用,
// 滚轮弹层必须挂进最近的 .sheet 才能交互(无 sheet 时挂 body)。
function nearestSheet() {
  return (document.querySelector(".sheet") ?? document.body) as HTMLElement;
}
export function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  maxLength = 500,
  min,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  maxLength?: number;
  min?: string;
  placeholder?: string;
}) {
  const id = useId();
  const [error, setError] = useState("");
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        min={min}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? id : undefined}
        onInvalid={(e) => {
          const input = e.currentTarget;
          const message = input.validity.rangeUnderflow
            ? `${label}不能早于 ${min}`
            : `请填写有效的${label}`;
          input.setCustomValidity(message);
          setError(message);
        }}
        onChange={(e) => {
          e.target.setCustomValidity("");
          setError("");
          onChange(e.target.value);
        }}
      />
      {error && (
        <small id={id} className="error-message" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
export function ZoneField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const zones = [
    ...new Set([
      ...destinations.map((d) => d.timezone),
      value,
      "UTC",
      ...Intl.supportedValuesOf("timeZone"),
    ]),
  ];
  return (
    <label className="select-field">
      <span>{label}</span>
      <Select
        aria-label={label}
        showSearch
        value={value}
        onChange={onChange}
        optionFilterProp="label"
        options={zones.map((z) => ({
          value: z,
          label: readableZone(z),
        }))}
      />
    </label>
  );
}
export function CurrencyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <Select
        aria-label={label}
        showSearch
        value={value}
        onChange={onChange}
        optionFilterProp="label"
        options={currencies.map((c) => ({
          value: c,
          label: currencyNames[c],
        }))}
      />
    </label>
  );
}
// 滚轮式日期/时间选择:只读输入框打开底部弹层,滚轮选完点「确定」提交。
// value 为空字符串表示未选择(如"时间待定"),用 placeholder 展示。
export function DateTimeWheelField({
  label,
  value,
  mode,
  min,
  max,
  disabled = false,
  placeholder = "请选择",
  onClear,
  onChange,
}: {
  label: string;
  value: string;
  mode: "date" | "datetime";
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  onClear?: () => void;
  onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const format = mode === "datetime" ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD";
  const precision =
    mode === "datetime" ? ("minute" as const) : ("day" as const);
  const current = value ? dayjs(value) : undefined;
  const now = dayjs();
  const boundary = (text: string | undefined, fallback: dayjs.Dayjs) => {
    const parsed = text ? dayjs(text) : fallback;
    return parsed.isValid() ? parsed.toDate() : fallback.toDate();
  };
  return (
    <label className="wheel-field">
      {label}
      <span
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-haspopup="dialog"
        className={`wheel-field-input${value ? "" : " wheel-field-empty"}`}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setVisible(true)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setVisible(true);
          }
        }}
      >
        {value || placeholder}
        {value && onClear && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={`清除${label}`}
            className="wheel-field-clear"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onClear();
              }
            }}
          >
            ×
          </span>
        )}
      </span>
      <DatePicker
        visible={visible}
        onClose={() => setVisible(false)}
        onConfirm={(date) => {
          onChange(dayjs(date).format(format));
          setVisible(false);
        }}
        getContainer={nearestSheet}
        value={current?.toDate()}
        defaultValue={current?.toDate() ?? now.toDate()}
        min={boundary(min, now.subtract(10, "year"))}
        max={boundary(max, now.add(15, "year"))}
        precision={precision}
        title={`选择${label}`}
        cancelText="取消"
        confirmText="确定"
      />
    </label>
  );
}
