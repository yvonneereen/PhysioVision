function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function normalizeClinicalMarkdown(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    // Gemini occasionally flattens Markdown block boundaries into spaces.
    // Restore the boundaries used by clinical plans before parsing them.
    .replace(/[ \t]+---[ \t]+/g, "\n\n---\n\n")
    .replace(/[ \t]+(?=#{1,6}[ \t]+)/g, "\n\n")
    .replace(
      /(#{1,6}[ \t]+\*\*[^*\n]+\*\*)[ \t]+(?=\*\*[^*\n:]{1,40}:\*\*)/g,
      "$1\n",
    )
    .replace(
      /(#{1,6}[ \t]+\*\*[^*\n]+\*\*)[ \t]+(?=\*(?:goal|focus|note|precaution):)/gi,
      "$1\n",
    )
    .replace(/[ \t]+(?=\d{1,2}\.[ \t]+\*\*)/g, "\n")
    .replace(/[ \t]+\*[ \t]+(?=\*\*(?:focus|dose|dosage|frequency|progression|goal|rationale|precaution|monitor|technique|equipment)\b)/gi, "\n  * ")
    .replace(/[ \t]+(?=\*?note:[ \t])/gi, "\n\n")
    .trim();
}

function inlineClinicalMarkdown(value) {
  let html = escapeHtml(value);
  const protectedFragments = [];
  const protect = fragment => {
    const index = protectedFragments.push(fragment) - 1;
    return `\uE000${index}\uE001`;
  };

  html = html.replace(/`([^`\n]+)`/g, (_, code) =>
    protect(`<code>${code}</code>`));
  html = html.replace(
    /\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/gi,
    (_, label, url) => protect(
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
    ),
  );
  html = html.replace(/https:\/\/[^\s<]+/gi, rawUrl => {
    const trailing = rawUrl.match(/[),.;:]+$/)?.[0] || "";
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    return `${protect(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)}${trailing}`;
  });
  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=$|[\s).,;:!?])/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s).,;:!?])/g, "$1<em>$2</em>");

  return html.replace(/\uE000(\d+)\uE001/g, (_, index) =>
    protectedFragments[Number(index)] || "");
}

function headingMatch(line) {
  return line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
}

function orderedMatch(line) {
  return line.match(/^\s*\d{1,2}[.)]\s+(.+)$/);
}

function bulletMatch(line) {
  return line.match(/^\s*[-*•]\s+(.+)$/);
}

function isRule(line) {
  return /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line);
}

function labelledFacts(value) {
  const pattern = /\*\*([^*\n:]{1,40}):\*\*\s*([\s\S]*?)(?=\s+\*\*[^*\n:]{1,40}:\*\*|$)/g;
  const matches = [...value.matchAll(pattern)];
  if (matches.length < 2) return "";
  const unmatched = value.replace(pattern, "").trim();
  if (unmatched) return "";
  return `
    <dl class="clinical-ai-facts">
      ${matches.map(match => `
        <div>
          <dt>${inlineClinicalMarkdown(match[1])}</dt>
          <dd>${inlineClinicalMarkdown(match[2].trim())}</dd>
        </div>`).join("")}
    </dl>`;
}

function renderOrderedList(lines, startIndex) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    while (!lines[index]?.trim() && orderedMatch(lines[index + 1] || "")) index += 1;
    const item = orderedMatch(lines[index] || "");
    if (!item) break;
    index += 1;
    const details = [];
    const continuation = [];

    while (index < lines.length) {
      const line = lines[index];
      if (orderedMatch(line)) break;
      if (!line.trim()) {
        let next = index + 1;
        while (next < lines.length && !lines[next].trim()) next += 1;
        if (orderedMatch(lines[next] || "")) {
          index = next;
          break;
        }
        if (headingMatch(lines[next] || "") || isRule(lines[next] || "")) {
          index = next;
          break;
        }
        index += 1;
        continue;
      }
      const detail = bulletMatch(line);
      if (detail) {
        details.push(detail[1]);
        index += 1;
        continue;
      }
      if (headingMatch(line) || isRule(line)) break;
      continuation.push(line.trim());
      index += 1;
    }

    items.push(`
      <li>
        <div class="clinical-ai-exercise-title">${inlineClinicalMarkdown(item[1])}</div>
        ${continuation.length ? `<p>${inlineClinicalMarkdown(continuation.join(" "))}</p>` : ""}
        ${details.length ? `
          <ul class="clinical-ai-detail-list">
            ${details.map(detail => `<li>${inlineClinicalMarkdown(detail)}</li>`).join("")}
          </ul>` : ""}
      </li>`);
  }

  return {
    html: `<ol class="clinical-ai-exercise-list">${items.join("")}</ol>`,
    nextIndex: index,
  };
}

function renderBulletList(lines, startIndex) {
  const items = [];
  let index = startIndex;
  while (index < lines.length) {
    const item = bulletMatch(lines[index]);
    if (!item) break;
    items.push(`<li>${inlineClinicalMarkdown(item[1])}</li>`);
    index += 1;
  }
  return {
    html: `<ul class="clinical-ai-bullet-list">${items.join("")}</ul>`,
    nextIndex: index,
  };
}

export function formatClinicalAssistantText(value) {
  const normalized = normalizeClinicalMarkdown(value);
  if (!normalized) return `<p class="clinical-ai-empty">No response was returned.</p>`;

  const lines = normalized.split("\n");
  const hasStructuredBlocks = lines.some(line => (
    headingMatch(line)
    || orderedMatch(line)
    || bulletMatch(line)
    || isRule(line)
    || labelledFacts(line)
    || /^(?:\*|_)?(?:note|important|clinical note|safety):/i.test(line.trim())
  ));
  if (!hasStructuredBlocks && normalized.length < 320) {
    return `<p>${inlineClinicalMarkdown(normalized.replace(/\n+/g, " "))}</p>`;
  }

  const blocks = [];
  let index = 0;
  let paragraphCount = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (isRule(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }
    const heading = headingMatch(line);
    if (heading) {
      const level = Math.min(5, Math.max(3, heading[1].length));
      blocks.push(`<h${level}>${inlineClinicalMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (orderedMatch(line)) {
      const list = renderOrderedList(lines, index);
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }
    if (bulletMatch(line)) {
      const list = renderBulletList(lines, index);
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const candidate = lines[index];
      if (!candidate.trim()) break;
      if (
        paragraphLines.length
        && (headingMatch(candidate) || orderedMatch(candidate) || bulletMatch(candidate) || isRule(candidate))
      ) break;
      paragraphLines.push(candidate.trim());
      index += 1;
    }
    const paragraph = paragraphLines.join(" ");
    const facts = labelledFacts(paragraph);
    if (facts) {
      blocks.push(facts);
      continue;
    }
    const plainPrefix = paragraph.replace(/[*_`]/g, "").trim().toLowerCase();
    if (/^(?:note|important|clinical note|safety):/.test(plainPrefix)) {
      blocks.push(`<aside class="clinical-ai-caution">${inlineClinicalMarkdown(paragraph)}</aside>`);
      continue;
    }
    paragraphCount += 1;
    const leadClass = paragraphCount === 1 ? ` class="clinical-ai-lead"` : "";
    blocks.push(`<p${leadClass}>${inlineClinicalMarkdown(paragraph)}</p>`);
  }

  return `<article class="clinical-ai-richtext">${blocks.join("")}</article>`;
}
