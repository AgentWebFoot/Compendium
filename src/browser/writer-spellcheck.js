export function createSpellcheckField(textarea, checkSpelling) {
  const shell = document.createElement("div");
  shell.className = "spellcheck-field";
  const editor = document.createElement("div");
  editor.className = "spellcheck-editor";
  const mirror = document.createElement("div");
  mirror.className = "spellcheck-mirror";
  mirror.setAttribute("aria-hidden", "true");
  editor.append(textarea, mirror);

  const menu = document.createElement("div");
  menu.className = "spellcheck-menu";
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", "Spelling suggestions");
  const status = document.createElement("p");
  status.className = "spellcheck-status";
  status.setAttribute("role", "status");
  shell.append(editor, status, menu);
  textarea.spellcheck = false;
  textarea.lang = "en-US";

  let issues = [];
  let checkedText = "";
  let timer;
  let request;

  function sync() {
    mirror.style.left = `${textarea.clientLeft}px`;
    mirror.style.top = `${textarea.clientTop}px`;
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.height = `${textarea.clientHeight}px`;
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
  }

  function highlight() {
    const content = document.createDocumentFragment();
    let end = 0;
    for (const [index, issue] of issues.entries()) {
      content.append(checkedText.slice(end, issue.start));
      const mark = document.createElement("mark");
      mark.dataset.spellingIssue = index;
      mark.textContent = issue.word;
      content.append(mark);
      end = issue.end;
    }
    content.append(checkedText.slice(end), "\u200B");
    mirror.replaceChildren(content);
    sync();
  }

  function closeSuggestions() {
    if (menu.matches(":popover-open")) menu.hidePopover();
  }

  function openSuggestions(issue, x, y) {
    menu.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = issue.word;
    menu.append(heading);
    if (issue.suggestions.length) {
      for (const suggestion of issue.suggestions) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = suggestion;
        button.addEventListener("click", () => {
          if (textarea.value !== checkedText) return closeSuggestions();
          textarea.setRangeText(suggestion, issue.start, issue.end, "end");
          textarea.focus();
          queueCheck();
        });
        menu.append(button);
      }
    } else {
      const empty = document.createElement("span");
      empty.textContent = "No suggestions";
      menu.append(empty);
    }
    menu.showPopover();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector("button")?.focus();
  }

  function issueAtCaret() {
    return issues.find(issue => textarea.selectionStart <= issue.end && textarea.selectionEnd >= issue.start);
  }

  function contextMenu(event) {
    if (textarea.value !== checkedText) return;
    const mark = [...mirror.querySelectorAll("mark")].find(node =>
      [...node.getClientRects()].some(rect => event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom));
    const issue = mark ? issues[Number(mark.dataset.spellingIssue)] : issueAtCaret();
    if (!issue) return;
    event.preventDefault();
    const rect = textarea.getBoundingClientRect();
    openSuggestions(issue, event.clientX || rect.left, event.clientY || rect.bottom);
  }

  function queueCheck() {
    clearTimeout(timer);
    request?.abort();
    closeSuggestions();
    issues = [];
    checkedText = textarea.value;
    highlight();
    status.textContent = "";
    const text = checkedText;
    if (!text.trim()) return;
    timer = setTimeout(async () => {
      const current = new AbortController();
      request = current;
      try {
        const result = await checkSpelling(text, { signal: current.signal });
        if (current.signal.aborted) return;
        textarea.spellcheck = false;
        issues = result.issues;
        highlight();
      } catch (error) {
        if (current.signal.aborted) return;
        if (error.status === 400) {
          status.textContent = error.message;
          return;
        }
        textarea.spellcheck = true;
        status.textContent = "Using browser spellcheck. The compendium dictionary is unavailable.";
      }
    }, 250);
  }

  textarea.addEventListener("input", queueCheck);
  textarea.addEventListener("scroll", sync);
  textarea.addEventListener("contextmenu", contextMenu);
  const resize = new ResizeObserver(sync);
  resize.observe(textarea);
  queueCheck();

  return {
    shell,
    dispose() {
      clearTimeout(timer);
      request?.abort();
      resize.disconnect();
      closeSuggestions();
    },
  };
}

