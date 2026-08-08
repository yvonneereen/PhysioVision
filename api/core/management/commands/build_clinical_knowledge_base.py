"""Build a local, auditable clinician knowledge base from approved PDF libraries."""

import io
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from django.core.management.base import BaseCommand, CommandError
from pypdf import PdfReader


DEFAULT_SOURCE = "https://www.massgeneral.org/orthopaedics/sports-medicine/physical-therapy/sports-rehab-protocols"
OUTPUT_PATH = Path(__file__).resolve().parents[3] / "knowledge_base" / "chunks.json"


class PdfLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.current_href = None
        self.current_text = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.current_href = dict(attrs).get("href")
            self.current_text = []

    def handle_data(self, data):
        if self.current_href:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.current_href:
            self.links.append((self.current_href, " ".join(self.current_text).strip()))
            self.current_href = None
            self.current_text = []


def fetch(url):
    request = Request(url, headers={"User-Agent": "PhysioVisionKnowledgeBase/1.0"})
    with urlopen(request, timeout=45) as response:
        return response.read()


def clean_text(value):
    value = value.replace("\x00", " ")
    return re.sub(r"\s+", " ", value).strip()


def page_chunks(text, *, max_words=320, overlap=45):
    words = clean_text(text).split()
    if not words:
        return []
    chunks = []
    cursor = 0
    while cursor < len(words):
        chunks.append(" ".join(words[cursor:cursor + max_words]))
        if cursor + max_words >= len(words):
            break
        cursor += max_words - overlap
    return chunks


class Command(BaseCommand):
    help = "Download approved rehabilitation PDFs and build retrieval chunks."

    def add_arguments(self, parser):
        parser.add_argument("links", nargs="*", default=[DEFAULT_SOURCE])
        parser.add_argument("--output", default=str(OUTPUT_PATH))
        parser.add_argument("--workers", type=int, default=8)

    def handle(self, *args, **options):
        documents = []
        for source_url in options["links"] or [DEFAULT_SOURCE]:
            try:
                body = fetch(source_url)
            except Exception as exc:
                raise CommandError(f"Could not fetch {source_url}: {exc}") from exc
            if urlparse(source_url).path.lower().endswith(".pdf"):
                documents.append((source_url, Path(urlparse(source_url).path).stem))
                continue
            parser = PdfLinkParser()
            parser.feed(body.decode("utf-8", errors="replace"))
            documents.extend(
                (urljoin(source_url, href), title)
                for href, title in parser.links
                if urlparse(urljoin(source_url, href)).path.lower().endswith(".pdf")
            )

        unique_documents = []
        seen = set()
        for url, title in documents:
            if url in seen:
                continue
            seen.add(url)
            unique_documents.append((url, clean_text(title) or Path(urlparse(url).path).stem))

        def extract_document(position, url, link_title):
            try:
                reader = PdfReader(io.BytesIO(fetch(url)))
            except Exception as exc:
                return position, [], str(exc)
            extracted_pages = [clean_text(page.extract_text() or "") for page in reader.pages]
            document_title = link_title
            if extracted_pages:
                title_match = re.search(
                    r"(?:Rehabilitation )?Protocol.*?"
                    r"(?=\s+This\s+(?:protocol|guideline)\b|\s+PHASE\s+I\b|$)",
                    extracted_pages[0],
                    re.I,
                )
                if title_match:
                    document_title = clean_text(title_match.group(0))
            document_chunks = []
            for page_number, page_text in enumerate(extracted_pages, start=1):
                for chunk_number, text in enumerate(page_chunks(page_text), start=1):
                    document_chunks.append({
                        "id": f"mgh-{position}-p{page_number}-c{chunk_number}",
                        "title": document_title,
                        "url": url,
                        "page": page_number,
                        "text": text,
                    })
            return position, document_chunks, None

        chunks_by_document = {}
        worker_count = max(1, min(options["workers"], 12))
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            futures = {
                executor.submit(extract_document, position, url, title): (position, url, title)
                for position, (url, title) in enumerate(unique_documents, start=1)
            }
            completed = 0
            for future in as_completed(futures):
                position, url, title = futures[future]
                completed += 1
                try:
                    _, document_chunks, error = future.result()
                except Exception as exc:
                    document_chunks, error = [], str(exc)
                if error:
                    self.stderr.write(self.style.WARNING(f"Skipped {url}: {error}"))
                else:
                    chunks_by_document[position] = document_chunks
                self.stdout.write(
                    f"[{completed}/{len(unique_documents)}] {title}"
                )

        chunks = [
            chunk
            for position in sorted(chunks_by_document)
            for chunk in chunks_by_document[position]
        ]

        output = Path(options["output"])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_libraries": options["links"] or [DEFAULT_SOURCE],
            "document_count": len(unique_documents),
            "chunk_count": len(chunks),
            "chunks": chunks,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(
            f"Wrote {len(chunks)} chunks from {len(unique_documents)} documents to {output}"
        ))
