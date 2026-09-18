const formatters = new Map<string, Intl.DateTimeFormat>();
export function localInput(instant: string, zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (formatters.size >= 64)
      formatters.delete(formatters.keys().next().value!);
    formatters.set(zone, formatter);
  }
  const parts = formatter.formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function zonedChoices(value: string, zone: string, offsetHint = "") {
  const base = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(base)) throw new Error("请填写完整日期和时间");
  const matches: string[] = [];
  // Sample surrounding offsets, including both sides of a DST transition.
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 12) {
    const sample = base + hours * 3600000;
    offsets.add(
      (Date.parse(localInput(new Date(sample).toISOString(), zone) + ":00Z") -
        sample) /
        60000,
    );
  }
  for (const offset of [...offsets].sort((a, b) => a - b)) {
    const instant = new Date(base - offset * 60000).toISOString();
    if (localInput(instant, zone) === value) {
      const sign = offset < 0 ? "-" : "+";
      const hint = `${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
      if (!offsetHint || offsetHint === hint) matches.push(instant);
    }
  }
  if (!matches.length)
    throw new Error("这个时间因当地调整时钟而不存在，请选择其他时间");
  return matches.sort();
}

export function zonedInstant(value: string, zone: string, offsetHint = "") {
  const matches = zonedChoices(value, zone, offsetHint);
  if (matches.length > 1)
    throw new Error("当地时钟回拨，这个时间出现两次，请选择第一次或第二次");
  return matches[0];
}
