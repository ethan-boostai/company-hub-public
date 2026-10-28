"use client";

import { CheckboxField, TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { SelectWithAdd } from "@/components/ui/select-with-add";
import { niceDate } from "../_registers/dates";
import { DeleteButton } from "../_registers/delete-button";
import { RecordFiles } from "../_registers/record-files";
import { Chip } from "../_registers/ui";
import { deleteCompanyRecord, saveCompany, saveDoc } from "./actions";
import type { Open } from "./companies-client";
import type { CompanyRow, DocRow } from "./data";
import { DOC_ITEM_LIST, docLabel, docState, KIND_LABEL, TRADE_LIST, type Kind } from "./rules";

const errorsOf = (state: { ok: boolean; fieldErrors?: Record<string, string> } | null) =>
  (state && !state.ok ? state.fieldErrors ?? {} : {}) as Record<string, string>;

export function CompanyForm({
  kind, company: c, docs, trades, today, onOpen, onSaved, onDeleted,
}: {
  kind: Kind;
  company: CompanyRow | null;
  docs: DocRow[];
  trades: string[];
  today: string;
  onOpen: (o: Open | null) => void;
  onSaved: (c: CompanyRow) => void;
  onDeleted: () => void;
}) {
  const sub = kind === "subcontractor";
  return (
    <div>
      {c && <p className="mb-4"><Chip>{KIND_LABEL[kind]}</Chip></p>}
      <GuardedForm action={saveCompany} onSaved={(r) => r.data && onSaved(r.data)}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              <input type="hidden" name="kind" value={kind} />
              {c && <input type="hidden" name="id" value={c.id} />}
              <TextField label="Company" name="name" defaultValue={c?.name} error={err.name} autoComplete="off" required />
              <SelectWithAdd list={TRADE_LIST} name="trade" label="Trade" options={trades} defaultValue={c?.trade ?? ""} />
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Contact name" name="contact" defaultValue={c?.contact} error={err.contact} autoComplete="off" />
                <TextField label={sub ? "Mobile" : "Phone"} name="phone" type="tel" defaultValue={c?.phone} error={err.phone} />
                <TextField label="Email" name="email" type="email" defaultValue={c?.email} error={err.email} spellCheck={false} />
                {!sub && <TextField label="Our account number" name="account_no" defaultValue={c?.accountNo} error={err.account_no} spellCheck={false} />}
              </div>
              {!sub && <TextArea label="Address" name="address" defaultValue={c?.address} error={err.address} rows={2} />}
              {sub && (
                <>
                  <CheckboxField label="Inducted to our process" name="inducted" defaultChecked={c?.inducted} />
                  <CheckboxField label="Approved to work" name="approved" defaultChecked={c?.approved} />
                </>
              )}
              <TextArea label="Notes" name="notes" defaultValue={c?.notes} error={err.notes} rows={3} />
              <SaveButton>{c ? "Save" : `Add ${kind}`}</SaveButton>
            </>
          );
        }}
      </GuardedForm>

      {c && (
        <>
          <section className="mt-6 border-t border-line pt-4">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-semibold flex-1">Insurance and documents</h3>
              <button type="button" onClick={() => onOpen({ view: "doc", kind, companyId: c.id, id: null })}
                className="px-3 py-1.5 rounded-lg border border-dark text-sm font-semibold hover:bg-paper">
                Add document
              </button>
            </div>
            {docs.length === 0 && <p className="text-sm text-muted">No documents yet.</p>}
            {docs.length > 0 && (
              <ul className="divide-y divide-line border border-line rounded-lg">
                {docs.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => onOpen({ view: "doc", kind, companyId: c.id, id: d.id })}
                      className="w-full text-left px-3 py-2 hover:bg-paper flex flex-wrap items-center gap-x-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{d.item}</span>
                        {d.reference && <span className="block text-xs text-muted truncate">{d.reference}</span>}
                      </span>
                      <Chip tone={docState(d.expiresOn, today)}>{docLabel(d.expiresOn, today)}</Chip>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <RecordFiles entityTable={sub ? "subcontractors" : "suppliers"} entityId={c.id} title="Other files" />
          <DeleteButton
            label={`Delete ${c.name}`}
            message={`This deletes ${c.name} and its ${docs.length} document record(s). Files stay in SharePoint. It cannot be undone.`}
            onDelete={(key) => deleteCompanyRecord(sub ? "subcontractors" : "suppliers", c.id, key)}
            onDeleted={onDeleted}
          />
        </>
      )}
    </div>
  );
}

export function DocForm({
  kind, companyId, company, doc: d, items, today, onOpen, onSaved, onDeleted,
}: {
  kind: Kind;
  companyId: number;
  company: CompanyRow | null;
  doc: DocRow | null;
  items: string[];
  today: string;
  onOpen: (o: Open | null) => void;
  onSaved: (d: DocRow) => void;
  onDeleted: () => void;
}) {
  return (
    <div>
      {company && (
        <p className="mb-4 text-sm">
          <button type="button" className="text-brand-dark font-semibold underline" onClick={() => onOpen({ view: "company", kind, id: companyId })}>
            Open {company.name}
          </button>
        </p>
      )}
      {d && <p className="mb-4"><Chip tone={docState(d.expiresOn, today)}>{docLabel(d.expiresOn, today)}</Chip></p>}
      <GuardedForm action={saveDoc} onSaved={(r) => r.data && onSaved(r.data)}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="company_id" value={companyId} />
              {d && <input type="hidden" name="id" value={d.id} />}
              <SelectWithAdd list={DOC_ITEM_LIST} name="item" label="Document" options={items} defaultValue={d?.item ?? ""} />
              {err.item && <p className="-mt-3 mb-4 text-sm text-danger">{err.item}</p>}
              <TextField label="Policy or certificate number" name="reference" defaultValue={d?.reference} error={err.reference} spellCheck={false} />
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Issued" name="issued_on" type="date" defaultValue={d?.issuedOn ?? ""} error={err.issued_on} />
                <TextField label="Expires" name="expires_on" type="date" defaultValue={d?.expiresOn ?? ""} error={err.expires_on}
                  hint="Leave blank if it doesn't expire" />
              </div>
              <TextArea label="Notes" name="notes" defaultValue={d?.notes} error={err.notes} rows={3} />
              <SaveButton>{d ? "Save" : "Add document"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>
      {d && (
        <>
          <RecordFiles entityTable="subcontractor_docs" entityId={d.id} title="Document files" />
          <DeleteButton
            label="Delete this document"
            message={`This deletes the ${d.item} record${d.expiresOn ? ` (expires ${niceDate(d.expiresOn)})` : ""} for ${company?.name ?? "this company"}. Files stay in SharePoint. It cannot be undone.`}
            onDelete={(key) => deleteCompanyRecord("subcontractor_docs", d.id, key)}
            onDeleted={onDeleted}
          />
        </>
      )}
    </div>
  );
}
