const formats = [
  { label: "Bold", symbol: "B", marker: "**", tag: "strong", shortcut: "b" },
  { label: "Italic", symbol: "I", marker: "*", tag: "em", shortcut: "i" },
  { label: "Underline", symbol: "U", marker: "++", tag: "u", shortcut: "u" },
  { label: "Strikethrough", symbol: "S", marker: "~~", tag: "s" },
];
const tags = new Map(formats.map(({ marker, tag }) => [marker, tag]));
const shortcuts = new Map(formats.filter(format => format.shortcut).map(format => [format.shortcut, format.marker]));

export function appendInline(node, text, referenceFor) {
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (index) node.append("\n");
    appendLine(node, line, referenceFor);
  }
  return node;
}

function appendLine(node, text, referenceFor) {
  const stack = [{ content: node }];
  const current = () => stack.at(-1);
  let offset = 0;

  function open(marker) {
    stack.push({ marker, content: node.ownerDocument.createDocumentFragment() });
  }

  function close() {
    const { marker, content } = stack.pop();
    const formatted = node.ownerDocument.createElement(tags.get(marker));
    formatted.append(content);
    current().content.append(formatted);
  }

  for (const match of text.matchAll(/\\([*+~<>\\])|<([^<>]+)>|\*+|\++|~+/g)) {
    current().content.append(text.slice(offset, match.index));
    const [token, escaped, reference] = match;
    offset = match.index + token.length;
    if (escaped) {
      current().content.append(escaped);
      continue;
    }
    if (reference) {
      current().content.append(referenceFor(reference) ?? token);
      continue;
    }

    const canOpen = offset < text.length && !/\s/.test(text[offset]);
    const canClose = match.index > 0 && !/\s/.test(text[match.index - 1]);
    if (token[0] === "*" && token.length <= 3) {
      let remaining = token.length;
      while (remaining) {
        const marker = current().marker;
        if (canClose && marker?.startsWith("*") && marker.length <= remaining) {
          remaining -= marker.length;
          close();
        } else if (canOpen) {
          const length = Math.min(2, remaining);
          open("*".repeat(length));
          remaining -= length;
        } else {
          current().content.append("*".repeat(remaining));
          break;
        }
      }
    } else if (tags.has(token)) {
      if (canClose && current().marker === token) close();
      else if (canOpen) open(token);
      else current().content.append(token);
    } else {
      current().content.append(token);
    }
  }
  current().content.append(text.slice(offset));

  while (stack.length > 1) {
    const { marker, content } = stack.pop();
    current().content.append(marker, content);
  }
}

function surrounds(value, start, end, marker) {
  const length = marker.length;
  if (value.slice(start - length, start) !== marker || value.slice(end, end + length) !== marker) return false;
  if (marker !== "*") return true;
  const left = value.slice(0, start).match(/\*+$/)?.[0].length;
  const right = value.slice(end).match(/^\*+/)?.[0].length;
  return left !== 2 && right !== 2;
}

function toggleFormatting(textarea, marker) {
  const { value } = textarea;
  let start = textarea.selectionStart;
  let end = textarea.selectionEnd;
  const selected = value.slice(start, end);
  let replacement;
  let selectionStart;
  let selectionEnd;

  if (!selected.includes("\n") && surrounds(value, start, end, marker)) {
    start -= marker.length;
    end += marker.length;
    replacement = selected;
    selectionStart = start;
    selectionEnd = start + selected.length;
  } else if (!selected.includes("\n") && selected.length > marker.length * 2
    && surrounds(selected, marker.length, selected.length - marker.length, marker)) {
    replacement = selected.slice(marker.length, -marker.length);
    selectionStart = start;
    selectionEnd = start + replacement.length;
  } else if (selected.includes("\n")) {
    replacement = selected.split("\n").map(line => {
      const [, before, text, after] = line.match(/^([ \t]*(?:#{1,3}[ \t]+)?)(.*?)([ \t]*)$/) ?? ["", "", line, ""];
      if (!text || text.startsWith("|") || text.startsWith("![")) return line;
      if (text.length > marker.length * 2 && surrounds(text, marker.length, text.length - marker.length, marker)) {
        return before + text.slice(marker.length, -marker.length) + after;
      }
      return before + marker + text + marker + after;
    }).join("\n");
    selectionStart = start;
    selectionEnd = start + replacement.length;
  } else {
    const pattern = start === 0 || value[start - 1] === "\n"
      ? /^([ \t]*(?:#{1,3}[ \t]+)?)(.*?)([ \t]*)$/
      : /^([ \t]*)(.*?)([ \t]*)$/;
    const [, before, text, after] = selected.match(pattern) ?? ["", "", selected, ""];
    replacement = before + marker + text + marker + after;
    selectionStart = start + before.length + marker.length;
    selectionEnd = selectionStart + text.length;
  }

  textarea.setRangeText(replacement, start, end, "end");
  textarea.focus();
  textarea.setSelectionRange(selectionStart, selectionEnd);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

export function createFormattingControls(textarea, field) {
  const group = textarea.ownerDocument.createElement("div");
  group.className = "formatting-controls";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", `Format ${field}`);
  for (const { label, symbol, marker, tag } of formats) {
    const button = textarea.ownerDocument.createElement("button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const text = textarea.ownerDocument.createElement(tag);
    text.textContent = symbol;
    button.append(text);
    button.addEventListener("click", () => toggleFormatting(textarea, marker));
    group.append(button);
  }
  textarea.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const marker = shortcuts.get(event.key.toLowerCase());
    if (!marker) return;
    event.preventDefault();
    toggleFormatting(textarea, marker);
  });
  return group;
}

