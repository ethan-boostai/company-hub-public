"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { SelectWithAdd } from "@/components/ui/select-with-add";
import { niceDate } from "../_registers/dates";
import { RecordFiles } from "../_registers/record-files";
import { Chip, MiniList, RecordSelect, Section, StatusBox } from "../_registers/ui";
import { deleteTraining, saveTraining, type Saved } from "./actions";
import type { TrainingData, TrainingRow } from "./data";
import { bestRecords, isSuperseded, QUAL_LIST, STATE_TONE, ticketLabel, ticketState } from "./rules";

export type Open = { id: number | null; personId?: number; qualification?: string };

const errorsOf = (state: { ok: boolean; fieldErrors?: Record<string, string> } | null) =>
  (state && !state.ok ? state.fieldErrors ?? {} : {}) as Record<string, string>;

export function TrainingForm({
  record: r, prefill, data, today, onOpen, onSaved,
}: {
  record: TrainingRow | null;
  prefill: Open;
  data: TrainingData;
  today: string;
  onOpen: (o: Open | null) => void;
  onSaved: (s: Saved, next: Open | null) => void;
}) {
  const [asking, setAsking] = useState(false);
  const personId = r?.personId ?? prefill.personId;
  const person = data.people.find((p) => p.id === personId);
  const best = bestRecords(data.records);
  const history = r
    ? data.records.filter((x) => x.personId === r.personId && x.qualification.toLowerCase() === r.qualification.toLowerCase() && x.id !== r.id)
    : [];
  const people = data.people.filter((p) => p.active || p.id === personId).map((p) => ({ value: String(p.id), label: p.active ? p.name : `${p.name} (left)` }));

  return (
    <div>
      {r && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatusBox label="Status" value={ticketLabel(r, today)} tone={STATE_TONE[ticketState(r, today)]}
            note={isSuperseded(best, r) ? "Replaced by a newer record. Not on the matrix." : "Shown on the matrix"} />
          <StatusBox label="Issued" value={r.issuedOn ? niceDate(r.issuedOn) : ""} />
        </div>
      )}
      <GuardedForm action={saveTraining} onSaved={(res) => res.data && onSaved(res.data, { id: res.data.id })}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              {r && <input type="hidden" name="id" value={r.id} />}
              <RecordSelect label="Person" name="person_id" options={people} defaultValue={personId ? String(personId) : ""} error={err.person_id} />
              <SelectWithAdd list={QUAL_LIST} name="qualification" label="Ticket or qualification" options={data.quals} defaultValue={r?.qualification ?? prefill.qualification ?? ""} />
              {err.qualification && <p className="-mt-3 mb-4 text-sm text-danger">{err.qualification}</p>}
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Provider" name="provider" defaultValue={r?.provider} error={err.provider} />
                <TextField label="Certificate or licence number" name="reference" defaultValue={r?.reference} error={err.reference} spellCheck={false} />
                <TextField label="Issued" name="issued_on" type="date" defaultValue={r?.issuedOn ?? ""} error={err.issued_on} />
                <TextField label="Expires" name="expires_on" type="date" defaultValue={r?.expiresOn ?? ""} error={err.expires_on} hint="Leave blank if it doesn't expire" />
              </div>
              <TextArea label="Notes" name="notes" defaultValue={r?.notes} error={err.notes} rows={3} />
              <SaveButton>{r ? "Save" : "Add training"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>

      {r && (
        <>
          {history.length > 0 && (
            <Section title={`Other ${r.qualification} records for ${person?.name ?? "this person"}`}>
              <MiniList empty="" items={history.map((x) => ({
                key: x.id, title: ticketLabel(x, today), sub: [x.provider, x.reference].filter(Boolean).join(" · "), onClick: () => onOpen({ id: x.id }),
                chips: isSuperseded(best, x) ? <Chip>Earlier record</Chip> : <Chip tone={STATE_TONE[ticketState(x, today)]}>On the matrix</Chip>,
              }))} />
            </Section>
          )}
          <RecordFiles entityTable="training_records" entityId={r.id} title="Certificate and card photos" />
          <div className="mt-8 border-t border-line pt-5">
            <button type="button" onClick={() => setAsking(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">Delete this record</button>
            <ConfirmDialog
              open={asking}
              title="Delete this record?"
              message={`This deletes ${person?.name ?? "this person"}'s ${r.qualification} record${r.expiresOn ? ` (expires ${niceDate(r.expiresOn)})` : ""}. Files stay in SharePoint. It cannot be undone.`}
              confirmLabel="Delete"
              onClose={() => setAsking(false)}
              onConfirm={async () => {
                const res = await deleteTraining(r.id, crypto.randomUUID());
                if (res.ok && res.data) onSaved(res.data, null);
                return res;
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
