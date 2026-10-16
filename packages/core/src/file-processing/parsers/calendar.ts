/**
 * The events of an iCalendar part (RFC 5545), as the lines a reader needs:
 * what, when, where, who. A meeting invite is a mail whose body is often empty
 * and whose whole content sits in a `text/calendar` part, which was listed as
 * `unnamed-1` and never read. Thunderbird renders the same fields from it; Tika
 * and MarkItDown read nothing.
 *
 * Times are written as stated, `2026-10-20 09:00 UTC` or with their `TZID`, and
 * never converted. A cancellation or a reply says so, so it never reads as an
 * invite. Anything that is not a VEVENT (a to-do, a free/busy block) yields
 * nothing and the part stays listed as an attachment.
 */

const FIELDS = [
  ["SUMMARY", "Event"],
  ["DTSTART", "Starts"],
  ["DTEND", "Ends"],
  ["RRULE", "Repeats"],
  ["LOCATION", "Location"],
  ["ORGANIZER", "Organizer"],
  ["ATTENDEE", "Attendees"],
  ["DESCRIPTION", "Description"],
] as const;

/** TEXT escapes (3.3.11): `\\`, `\;`, `\,`, and `\n` or `\N` for a line break. */
const unescape = (value: string) => value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

/** A parameter's value, quoted (`CN="Doe, Jane"`) or not (3.2). */
const param = (params: string, name: string) => new RegExp(`;${name}=(?:"([^"]*)"|([^;:]*))`, "i").exec(params)?.slice(1).find((v) => v !== undefined);

function person(params: string, value: string): string {
  const address = value.replace(/^mailto:/i, "");
  const name = param(params, "CN");
  return name && name !== address ? `${name} <${address}>` : address;
}

/** DATE-TIME (3.3.5): UTC with `Z`, local to a `TZID`, or floating; `VALUE=DATE` has no time. */
function when(params: string, value: string): string {
  const parts = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)\d\d(Z)?)?$/.exec(value);
  if (!parts) return value;
  const [, year, month, day, hour, minute, utc] = parts;
  if (!hour) return `${year}-${month}-${day}`;
  const zone = utc ? "UTC" : param(params, "TZID");
  return `${year}-${month}-${day} ${hour}:${minute}${zone ? ` ${zone}` : ""}`;
}

/** One block of `Label: value` lines per VEVENT, in order. */
export function formatCalendar(ics: string): string[] {
  // Unfold first (3.1): a line break followed by one space or tab continues the line.
  const lines = ics.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: Map<string, string[]>[] = [];
  let method = "";
  let event: Map<string, string[]> | null = null;
  for (const line of lines) {
    const parsed = /^([A-Z0-9-]+)((?:;(?:[^:"]|"[^"]*")*)?):(.*)$/i.exec(line);
    if (!parsed) continue;
    const [, rawName, params, value] = parsed;
    const name = rawName.toUpperCase();
    if (name === "BEGIN" && value.toUpperCase() === "VEVENT") event = new Map();
    else if (name === "END" && value.toUpperCase() === "VEVENT" && event) {
      events.push(event);
      event = null;
    } else if (name === "METHOD" && !event) method = value.toUpperCase();
    else if (event) {
      const text =
        name === "ORGANIZER" || name === "ATTENDEE" ? person(params, value)
        : name === "DTSTART" || name === "DTEND" ? when(params, value)
        : unescape(value);
      event.set(name, [...(event.get(name) ?? []), text]);
    }
  }
  // REQUEST and PUBLISH are the plain invite; anything else changes what it means.
  const header = method && method !== "REQUEST" && method !== "PUBLISH" ? [`Method: ${method}`] : [];
  return events.map((fields) =>
    [
      ...header,
      ...FIELDS.filter(([key]) => fields.has(key)).map(([key, label]) => `${label}: ${fields.get(key)!.join(", ")}`),
    ].join("\n"),
  );
}
