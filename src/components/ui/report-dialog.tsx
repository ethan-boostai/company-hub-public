"use client";

import { useState } from "react";
import { Button } from "./button";
import { DocViewer } from "./doc-viewer";
import { Modal } from "./overlay";

// The one "Create report" dialog (Reports ▾ > Create report on every page). The user chooses what
// goes in, then the PDF opens in-window. Pages describe their choices as groups; nobody builds their
// own dialog. As the live hub's "Include in report" picker: boxed groups, Select all / Clear on tick
// groups, a hint beside a choice, choices that can't apply greyed with the reason, and the last
// choices remembered on this device.

export type ReportState = Record<string, string | string[]>;

export type ReportOption = {
  value: string;
  label: string;
  hint?: string; // grey text after the label, e.g. "3 held"
  indent?: boolean; // sits under the choice above it
  // Greyed out (and left out of the report) when this returns a reason.
  off?: (s: ReportState) => string | false | null | undefined;
};

export type ReportGroup = {
  key: string;
  label: string;
  // ticks = tick boxes (several); pick = radios (one); select = a drop-down (one, for long lists such
  // as people); dates = a From and To date (options give the two labels, initial is [from, to]).
  type: "ticks" | "pick" | "select" | "dates";
  options: ReportOption[];
  initial: string[] | string; // ticks: values ticked; pick/select: the value picked; dates: [from, to]
  twoColumns?: boolean;
  show?: (s: ReportState) => boolean; // hide the whole group, e.g. columns of a part left out
};

export type ReportHelpers = {
  // Is this tick box ticked and not greyed out (and its group shown)?
  on: (group: string, value: string) => boolean;
  // The picked value of a radio or drop-down group.
  pick: (group: string) => string;
  // A dates group's [from, to] ("" when empty).
  dates: (group: string) => [string, string];
  // The ticked, not greyed out values of a tick group.
  ticked: (group: string) => string[];
};

const KEY = (id: string) => `cbs.report.${id}`;

function initialState(groups: ReportGroup[]): ReportState {
  return Object.fromEntries(groups.map((g) => [g.key, Array.isArray(g.initial) ? [...g.initial] : g.initial]));
}

// The last choices on this device, kept only where they still fit the groups.
function remembered(id: string, groups: ReportGroup[]): ReportState {
  const s = initialState(groups);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY(id)) || "null") as ReportState | null;
    if (!saved) return s;
    for (const g of groups) {
      const v = saved[g.key];
      const ok = new Set(g.options.map((o) => o.value));
      if (g.type === "ticks" && Array.isArray(v)) s[g.key] = v.filter((x) => ok.has(x));
      if ((g.type === "pick" || g.type === "select") && typeof v === "string" && ok.has(v)) s[g.key] = v;
      // Dates aren't remembered: a report's period starts fresh each time.
    }
  } catch {
    /* storage unavailable: start from the defaults */
  }
  return s;
}

export function helpersFor(groups: ReportGroup[], s: ReportState): ReportHelpers {
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const shown = (g: ReportGroup | undefined) => !!g && (!g.show || g.show(s));
  const on = (group: string, value: string) => {
    const g = byKey.get(group);
    const o = g?.options.find((x) => x.value === value);
    const v = s[group];
    return shown(g) && !!o && !o.off?.(s) && Array.isArray(v) && v.includes(value);
  };
  return {
    on,
    pick: (group) => {
      const v = s[group];
      return typeof v === "string" ? v : "";
    },
    ticked: (group) => (byKey.get(group)?.options ?? []).filter((o) => on(group, o.value)).map((o) => o.value),
    dates: (group) => {
      const v = s[group];
      return Array.isArray(v) ? [v[0] ?? "", v[1] ?? ""] : ["", ""];
    },
  };
}

export function ReportDialog({
  open,
  onClose,
  id,
  title = "Create report",
  note,
  fileName,
  groups,
  url,
  check,
}: {
  open: boolean;
  onClose: () => void;
  id: string; // remembers the choices on this device, e.g. "fleet"
  title?: string;
  note?: string;
  fileName: string; // the PDF's name in the viewer, e.g. "Fleet list.pdf"
  groups: ReportGroup[];
  url: (h: ReportHelpers, s: ReportState) => string; // the report route with the choices
  check?: (h: ReportHelpers, s: ReportState) => string | null; // a reason the report can't be made yet
}) {
  const [state, setState] = useState<ReportState | null>(null);
  const [shown, setShown] = useState("");
  // Choices load from this device when the dialog opens (never during the server render).
  const s = state ?? (open ? remembered(id, groups) : initialState(groups));
  const h = helpersFor(groups, s);
  const problem = check?.(h, s) ?? null;

  const set = (key: string, v: string | string[]) => setState({ ...s, [key]: v });
  const flip = (key: string, value: string) => {
    const v = Array.isArray(s[key]) ? (s[key] as string[]) : [];
    set(key, v.includes(value) ? v.filter((x) => x !== value) : [...v, value]);
  };
  const close = () => {
    setState(null);
    onClose();
  };
  function create() {
    if (problem || shown) return;
    try {
      localStorage.setItem(KEY(id), JSON.stringify(s));
    } catch {
      /* not remembered; the report still opens */
    }
    setShown(url(h, s));
  }

  return (
    <>
      <Modal open={open && !shown} onClose={close} title={title} size="max-w-lg">
        <div className="flex max-h-[85dvh] flex-col">
          <div className="border-b border-line px-5 pt-5 pb-3">
            <p className="text-lg font-semibold" aria-hidden="true">{title}</p>
            {note && <p className="mt-1 text-sm text-muted">{note}</p>}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {groups.map((g) => {
              if (g.show && !g.show(s)) return null;
              const value = s[g.key];
              const ticks = g.type === "ticks";
              if (g.type === "select" || g.type === "dates") {
                const field = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px]";
                return (
                  <fieldset key={g.key} className="mb-3 rounded-lg border border-line px-4 pt-2 pb-3">
                    <legend className="px-1 text-sm font-semibold">{g.label}</legend>
                    {g.type === "select" ? (
                      <select aria-label={g.label} value={typeof value === "string" ? value : ""} onChange={(e) => set(g.key, e.target.value)} className={field}>
                        {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {[0, 1].map((i) => (
                          <label key={i} className="text-sm">
                            <span className="mb-1 block">{g.options[i]?.label ?? (i ? "To" : "From")}</span>
                            <input
                              type="date"
                              value={(Array.isArray(value) ? value[i] : "") ?? ""}
                              onChange={(e) => {
                                const v = Array.isArray(value) ? [...value] : ["", ""];
                                v[i] = e.target.value;
                                set(g.key, v);
                              }}
                              className={field}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                );
              }
              const live = g.options.filter((o) => !o.off?.(s));
              return (
                <fieldset key={g.key} className="mb-3 rounded-lg border border-line px-4 pt-2 pb-3">
                  <legend className="px-1 text-sm font-semibold">{g.label}</legend>
                  {ticks && g.options.length > 2 && (
                    <div className="mb-1 flex gap-3 text-sm">
                      <button type="button" className="text-brand-dark underline" onClick={() => set(g.key, live.map((o) => o.value))}>Select all</button>
                      <button type="button" className="text-brand-dark underline" onClick={() => set(g.key, [])}>Clear</button>
                    </div>
                  )}
                  <div className={g.twoColumns ? "grid grid-cols-1 gap-x-4 sm:grid-cols-2" : ""}>
                    {g.options.map((o) => {
                      const reason = o.off?.(s) || "";
                      const checked = ticks ? Array.isArray(value) && value.includes(o.value) && !reason : value === o.value;
                      return (
                        <label key={o.value} className={`flex items-start gap-2 py-1 text-sm ${o.indent ? "ml-6" : ""} ${reason ? "text-muted" : ""}`}>
                          <input
                            type={ticks ? "checkbox" : "radio"}
                            name={`${id}-${g.key}`}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                            checked={checked}
                            disabled={!!reason}
                            onChange={() => (ticks ? flip(g.key, o.value) : set(g.key, o.value))}
                          />
                          <span>
                            {o.label}
                            {o.hint && <span className="ml-1.5 text-muted">{o.hint}</span>}
                            {reason && <span className="block text-xs">{reason}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {problem && <p role="alert" className="mr-auto text-sm text-danger">{problem}</p>}
            <Button onClick={close}>Cancel</Button>
            <Button tone="primary" onClick={create} disabled={!!problem}>Create report</Button>
          </div>
        </div>
      </Modal>
      <DocViewer
        file={shown ? { id: 0, name: fileName, mime: "application/pdf", url: shown } : null}
        onClose={() => {
          setShown("");
          close();
        }}
      />
    </>
  );
}
