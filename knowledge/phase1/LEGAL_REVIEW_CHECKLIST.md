# Phase 1 legal review checklist

Review each pending record against its hash-matched raw PDF. Approval is a
record-level legal decision, not a bulk file rename.

- Confirm the text exactly matches the cited page.
- Confirm the Article/Section label and remove or correct extraction artifacts.
- Confirm the provision was in force for the date covered by the answer.
- Check amendments, substitutions, omissions, savings, repeals and schedules.
- Preserve material provisos, explanations, illustrations and footnotes.
- For BNS section 106(2) and the matching BNSS First Schedule entry, verify the
  commencement position separately before any answer is approved.
- Add the reviewer name, review date and a short decision note to the review
  record retained outside the runtime corpus.
- Mark the corpus record `approved` only after the reviewer signs it off.
- Run `scripts/import_approved_records.py` only on the approved-only JSONL.

After import, test every verified question in `evaluation/questions.jsonl` and
record pass/fail evidence before releasing the chatbot to users.
