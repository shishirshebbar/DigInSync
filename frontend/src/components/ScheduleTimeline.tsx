import { displayDate } from "./ui";
export interface TimelineItem {
  id: string;
  label: string;
  start: string;
  end: string;
}

export default function ScheduleTimeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return null;
  const earliest = Math.min(...items.map((item) => Date.parse(item.start)));
  const latest = Math.max(...items.map((item) => Date.parse(item.end)));
  const span = Math.max(86400000, latest - earliest);
  return (
    <figure className="space-y-3" aria-label="Schedule timeline">
      <figcaption className="text-sm font-semibold">
        Schedule timeline · end dates exclusive
      </figcaption>
      {items.map((item) => (
        <div key={item.id} className="text-sm">
          <p className="mb-1 break-words">
            {item.label}{" "}
            <span className="text-xs text-slate-500">
              {displayDate(item.start)} – {displayDate(item.end)}
            </span>
          </p>
          <div className="h-3 rounded bg-slate-100" aria-hidden="true">
            <div
              className="h-3 rounded bg-teal-600"
              style={{
                marginLeft: `${((Date.parse(item.start) - earliest) / span) * 100}%`,
                width: `${((Date.parse(item.end) - Date.parse(item.start)) / span) * 100}%`,
              }}
            />
          </div>
        </div>
      ))}
    </figure>
  );
}
