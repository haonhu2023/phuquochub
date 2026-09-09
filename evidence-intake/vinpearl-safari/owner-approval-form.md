# Owner approval form — Vinpearl Safari evidence intake

Fill in one copy of this form per intake batch (i.e. once per time you hand a set of files to
`verify-evidence-files.sh`). This form is the explicit human sign-off gate — without it, nothing
in `files/` is treated as approved evidence, no matter how complete the manifest is.

## Batch identification

- Batch date: `____________________`
- Number of evidence files in this batch: `____________________`
- Manifest rows this batch corresponds to (evidence_id list): `____________________`

## Owner statement

I confirm that:

- [ ] I personally captured, or personally supervised the capture of, every file in this batch.
- [ ] Every file is a genuine, unedited screenshot or PDF of the source page at the time stated in
      the manifest — no cropping, no re-typing, no AI-generated or AI-modified content.
- [ ] The `place_id` recorded for each file is correct for the intended environment (production
      `7ab06900-8d98-4222-8cfd-794526e65667` vs. staging `8381328d-...`) — I have double-checked
      this, not assumed it.
- [ ] I understand this form does **not** by itself change anything in the database. A separate,
      later evidence-review decision (by whoever is authorized to make it) is required before any
      of this evidence affects `verification_status`, `opening_hours`, or any other place field.
- [ ] I understand D2 (opening hours), D3 (phone), and D5 (short_description) are currently HOLD /
      UNRESOLVED specifically because they lack primary evidence — this batch may be an input to
      resolving that, but submitting it does not resolve it automatically.

Signed (name): `____________________`
Date: `____________________`

## For whoever runs the validator

- [ ] `verify-evidence-files.sh` was run against this batch and its report is attached/referenced:
      `____________________`
- [ ] The report's overall result was: PASS / HOLD / FAIL (circle one)
- [ ] If FAIL or HOLD: the batch was NOT forwarded for evidence review until resolved.

This form, once signed, should be kept alongside the batch's manifest rows and validator report —
not discarded after the fact.
