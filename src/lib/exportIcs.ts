import type { EventItem, EventRow } from "./database.types";

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545: fold long content lines (75 octets) with CRLF + leading space. */
function foldIcsLine(line: string) {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  if (rest) out.push(rest);
  return out.join("\r\n");
}

/** Build a single-event .ics (iCalendar) file for calendar apps. */
export function buildEventIcs(event: EventRow) {
  const now = new Date();
  const stamp = formatUtcIcsDate(now);
  const uid = `${event.id}@party-planner.local`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Party Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
  ];
  if (event.starts_at) {
    const start = new Date(event.starts_at);
    const end = event.ends_at
      ? new Date(event.ends_at)
      : new Date(start.getTime() + 3 * 60 * 60 * 1000);
    lines.push(`DTSTART:${formatUtcIcsDate(start)}`, `DTEND:${formatUtcIcsDate(end)}`);
  } else {
    const d = event.created_at ? new Date(event.created_at) : now;
    const day = formatIcsAllDayDate(d);
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${formatIcsAllDayDate(next)}`);
  }
  lines.push(`SUMMARY:${icsEscape(event.name)}`);
  if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
  const desc = [event.description, event.partiful_url ? `Partiful: ${event.partiful_url}` : ""]
    .filter(Boolean)
    .join("\n");
  if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function buildEventScheduleIcs(event: EventRow, items: EventItem[]) {
  const base = buildEventIcs(event).trimEnd().replace("END:VCALENDAR", "");
  const stamp = formatUtcIcsDate(new Date());
  const taskEvents = items
    .filter((item) => item.due_at)
    .map((item) => {
      const start = new Date(item.due_at!);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const lines = [
        "BEGIN:VEVENT",
        `UID:${item.id}@party-planner.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${formatUtcIcsDate(start)}`,
        `DTEND:${formatUtcIcsDate(end)}`,
        `SUMMARY:${icsEscape(`Task: ${item.title}`)}`,
        item.description ? `DESCRIPTION:${icsEscape(item.description)}` : "",
        "END:VEVENT",
      ].filter(Boolean);
      return lines.map(foldIcsLine).join("\r\n");
    });
  return [base, ...taskEvents, "END:VCALENDAR"].join("\r\n") + "\r\n";
}

function formatUtcIcsDate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

function formatIcsAllDayDate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function downloadEventIcs(event: EventRow) {
  downloadIcsBlob(buildEventIcs(event), event.name);
}

export function downloadEventScheduleIcs(event: EventRow, items: EventItem[]) {
  downloadIcsBlob(buildEventScheduleIcs(event, items), `${event.name} schedule`);
}

function downloadIcsBlob(contents: string, name: string) {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80) || "event"}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
