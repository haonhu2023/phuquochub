# docs/delivery/findings/ — findings with a recorded owner decision

This directory was created on **2026-07-23** by the owner-decision approval gate for F-1, F-6 and
F-17. It did **not** exist before that date.

## What lives here

**Only** findings that have a recorded owner decision in
[`../decisions/`](../decisions/). Each file carries the four-part state the delivery framework
distinguishes, so that "the owner decided" is never mistaken for "the code changed":

| field | meaning |
|---|---|
| `decision_status` | has an owner ruled? (`AWAITING_OWNER` · `APPROVED` · `REJECTED` · `SUPERSEDED` · `DEFERRED`) |
| `implementation_status` | has the approved behaviour been built? |
| `validation_status` | has it been proven by executed evidence? |
| `release_blocker_status` | does it still block release? (`OPEN` · `CLEARED`) |

A finding is **never** marked resolved because a decision document exists. All four fields must
support it.

## What does NOT live here

Every other finding (F-2..F-5, F-7..F-16, F-18..F-34 and the GAP-nn register) remains recorded
where it always was:

- `docs/delivery/workstreams/place.yaml` — `known_gaps`, `resolved_gaps`, `known_risks`;
- the per-task reports in `docs/delivery/reports/`;
- the per-task evidence indexes in `docs/delivery/evidence/`.

This directory is **not** a complete findings register and must not be read as one. Migrating the
remaining findings here was **not** authorized by the decision gate and was deliberately not done.
