"""Index approved records only; requires Qdrant and Ollama embeddinggemma."""

import argparse
import json
import uuid

import ollama
from qdrant_client import QdrantClient, models


parser = argparse.ArgumentParser()
parser.add_argument("jsonl")
parser.add_argument("--collection", default="indian_legal_approved")
args = parser.parse_args()
records = [json.loads(line) for line in open(args.jsonl, encoding="utf-8") if line.strip()]
records = [record for record in records if record["verification_status"] == "approved"]
if not records:
    raise SystemExit("No approved records. Complete human legal review before indexing.")

model = "embeddinggemma"
client = QdrantClient(url="http://localhost:6333")
probe = ollama.embed(model=model, input="legal document")["embeddings"][0]
if not client.collection_exists(args.collection):
    client.create_collection(
        args.collection,
        vectors_config=models.VectorParams(size=len(probe), distance=models.Distance.COSINE),
    )
for start in range(0, len(records), 16):
    batch = records[start:start + 16]
    vectors = ollama.embed(model=model, input=[record["text"] for record in batch])["embeddings"]
    points = [
        models.PointStruct(
            id=str(uuid.uuid5(uuid.NAMESPACE_URL, record["id"])),
            vector=vector,
            payload=record,
        )
        for record, vector in zip(batch, vectors)
    ]
    client.upsert(collection_name=args.collection, points=points, wait=True)
print(f"Indexed {len(records)} approved chunks")
