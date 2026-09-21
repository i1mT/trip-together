"use client";
import { useId } from "react";
import { ConfigProvider, Select, Switch } from "antd";
import zhCN from "antd/locale/zh_CN";
import { zonedChoices } from "@/lib/zoned-input";
import { localDate } from "@/lib/time";
import { destinations, readableZone } from "../../../../shared/travel-options";
import { DateTimeWheelField } from "./fields";
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
  const timed = v.timeMode === "timed";
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
    // 输入框始终显示完整年月日时分;未选时间的 00:00 只是显示,不代表已确认时间。
    const display = timed && time ? `${date} ${time}` : `${date} 00:00`;
    return (
      <div className="time-controls">
        <div className="time-control">
          <DateTimeWheelField
            label={label}
            mode="datetime"
            value={display}
            placeholder="时间待定"
            min={`${localDate(Date.now(), end ? v.endTimezone : v.timezone)}T00:00`}
            max={end ? undefined : "2099-12-31T23:59"}
            onClear={
              timed
                ? () =>
                    onChange({
                      ...v,
                      [key]: "",
                      timeMode: "date",
                      ...(end ? { lastChoice: "" } : { firstChoice: "" }),
                    })
                : undefined
            }
            onChange={(next) => {
              const spaceAt = next.indexOf(" ");
              const nextDate = spaceAt > 0 ? next.slice(0, spaceAt) : next;
              const nextTime = spaceAt > 0 ? next.slice(spaceAt + 1) : "";
              // 时间待定时选了整点 00:00 视为只改日期,不引入时间。
              const staysDate = !timed && nextTime === "00:00";
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
          时间待定时只记录日期；选择年月日和时分并确定后记录完整时间，清除按钮可回到时间待定。
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
