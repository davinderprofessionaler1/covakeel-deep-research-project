# Reviewed question set

Store reviewed Phase 1 test questions in `questions.jsonl`, one JSON object per
line. Use this shape:

```json
{
  "id": "phase1-q-0001",
  "question": "A real user question",
  "language": "en",
  "expected_answer": "Answer approved by the legal reviewer",
  "source_record_ids": ["constitution-<hash>-p<number>-c<number>"],
  "review_status": "verified",
  "reviewer": "Reviewer name",
  "reviewed_at": "YYYY-MM-DD",
  "notes": null
}
```

Use `draft` while the expected answer or citations are still being checked.
Only `verified` questions count in quality testing. Questions help measure and
improve retrieval, prompts and answer formatting; they do not approve legal
source records and they do not directly fine-tune the base model.
