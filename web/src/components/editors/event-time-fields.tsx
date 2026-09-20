"use client";
import { useId } from "react";
import { ConfigProvider, DatePicker, Select, Switch } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import { zonedChoices } from "@/lib/zoned-input";
import { destinations, readableZone } from "../../../../shared/travel-options";
import type { Timing } from "./event/timing";
export { resolveLocal, type Timing } from "./event/timing";
function RepeatedTime({
  value,
  zone,
  choice,
  onChange,
  label,
}: {
  value: string;
  zone: string;
  choice: string;
  onChange: (s: string) => void;
  label: string;
}) {
  let options: string[] = [];
  try {
    options = zonedChoices(value, zone);
  } catch {}
  if (options.length < 2) return null;
  return (
    <div className="time-control">
      <span>{label}在当地出现两次</span>
      <Select
        aria-label={`${label}出现次数`}
        value={choice || undefined}
        placeholder="请选择"
        onChange={onChange}
        options={[
          { value: "0", label: "第一次（时钟回拨前）" },
          { value: "1", label: "第二次（时钟回拨后）" },
        ]}
      />
    </div>
  );
}
export function EventTimeFields({
  v,
  kind,
  onChange,
}: {
  v: Timing;
  kind: string;
  onChange: (v: Timing) => void;
}) {
  const id = useId();
  const stay = kind === "stay",
    flight = kind === "flight";
  const zones = [
    ...new Set([
      v.timezone,
      v.endTimezone,
      ...destinations.map((d) => d.timezone),
      "UTC",
      ...Intl.supportedValuesOf("timeZone"),
    ]),
  ].map((value) => ({ value, label: readableZone(value) }));
  function set(key: keyof Timing, value: string | boolean) {
    onChange({
      ...v,
      [key]: value,
      ...(["date", "startTime", "timezone"].includes(key)
        ? { firstChoice: "" }
        : {}),
      ...(["endDate", "endTime", "endTimezone"].includes(key)
        ? { lastChoice: "" }
        : {}),
      ...(key === "startTime" ? { timeMode: value ? "timed" : "date" } : {}),
    });
  }
  // 日期与时间合并为一个控件：时间待定时只显示日期，确认后显示完整时分。
  const timed = v.timeMode === "timed";
  const format = timed ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD";
  const row = (end: boolean) => {
    const label = end
      ? stay
        ? "退房时间"
        : flight
          ? "落地时间"
          : "结束时间"
      : stay
        ? "入住时间"
        : flight
          ? "起飞时间"
          : "开始时间";
    const date = end ? v.endDate : v.date;
    const time = end ? v.endTime : v.startTime;
    const zoneLabel = end ? "到达地当地时间" : "当地时间";
    const key = end ? "endTime" : "startTime";
    return (
      <div className="time-controls">
        <div className="time-control">
          <label htmlFor={`${id}-${end}`}>{label}</label>
          <DatePicker
            id={`${id}-${end}`}
            aria-label={label}
            showTime={{ format: "HH:mm" }}
            format={format}
            inputReadOnly
            needConfirm
            showNow={false}
            placeholder="时间待定"
            value={dayjs(`${date}T${timed && time ? time : "00:00"}`)}
            onChange={(value) => {
              if (!value) {
                // 清空只去掉时间，日期保留，回到时间待定。
                onChange({
                  ...v,
                  [key]: "",
                  timeMode: "date",
                  ...(end ? { lastChoice: "" } : { firstChoice: "" }),
                });
                return;
              }
              const nextDate = value.format("YYYY-MM-DD");
              const nextTime = value.format("HH:mm");
              // 时间待定时只改日期（时分保持默认 00:00）不引入时间，保持待定。
              const staysDate = !timed && nextTime === "00:00" && !time;
              onChange({
                ...v,
                ...(end
                  ? { endDate: nextDate }
                  : {
                      date: nextDate,
                      endDate: v.endDate < nextDate ? nextDate : v.endDate,
                    }),
                [key]: staysDate ? "" : nextTime,
                timeMode: staysDate ? "date" : "timed",
                ...(end ? { lastChoice: "" } : { firstChoice: "" }),
              });
            }}
          />
        </div>
        <div className="time-control">
          <label htmlFor={`${id}-zone-${end}`}>{zoneLabel}</label>
          <Select
            id={`${id}-zone-${end}`}
            aria-label={zoneLabel}
            showSearch={false}
            value={end ? v.endTimezone : v.timezone}
            options={zones}
            onChange={(zone) =>
              onChange({
                ...v,
                ...(end
                  ? { endTimezone: zone, lastChoice: "" }
                  : {
                      timezone: zone,
                      firstChoice: "",
                      ...(v.endTimezone === v.timezone
                        ? { endTimezone: zone, lastChoice: "" }
                        : {}),
                    }),
              })
            }
          />
        </div>
      </div>
    );
  };
  return (
    <ConfigProvider
      locale={zhCN}
      getPopupContainer={(trigger) =>
        trigger?.closest<HTMLElement>(".sheet") ?? document.body
      }
      theme={{
        token: {
          colorPrimary: "#9685b0",
          motion: false,
          borderRadius: 12,
          controlHeight: 44,
          fontSize: 15,
          fontFamily: "inherit",
        },
      }}
    >
      <div className="event-timing">
        {row(false)}
        <div className="time-range-toggle">
          <span id={`${id}-range`}>时间段</span>
          <Switch
            aria-labelledby={`${id}-range`}
            checked={v.range}
            onChange={(checked) => set("range", checked)}
          />
        </div>
        {v.range && row(true)}
        <p className="muted time-help">
          时间待定时只记录日期；在面板中选定日期和时分并确认后即记录完整时间，清空输入框可回到时间待定。
        </p>
        {timed && (
          <>
            <RepeatedTime
              label="开始时间"
              value={`${v.date}T${v.startTime}`}
              zone={v.timezone}
              choice={v.firstChoice}
              onChange={(s) => set("firstChoice", s)}
            />
            {v.range && (
              <RepeatedTime
                label="结束时间"
                value={`${v.endDate}T${v.endTime}`}
                zone={v.endTimezone}
                choice={v.lastChoice}
                onChange={(s) => set("lastChoice", s)}
              />
            )}
          </>
        )}
      </div>
    </ConfigProvider>
  );
}
