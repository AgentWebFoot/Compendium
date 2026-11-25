import { getNavigation } from "../navigation.js";

const levels = ["tab", "subtab", "category"];

function button(text, label, click) {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = text;
  control.setAttribute("aria-label", label);
  control.addEventListener("click", click);
  return control;
}

export function createNavigationEditor(root, getConfiguration, onSaved, changeNavigation, saveTarget) {
  const dialog = root.querySelector("#navigation-dialog");
  const form = root.querySelector("#navigation-form");
  const name = root.querySelector("#navigation-name");
  const color = root.querySelector("#navigation-color");
  const useDefault = root.querySelector("#navigation-default-color");
  const type = root.querySelector("#navigation-type");
  const status = root.querySelector("#navigation-status");
  const announcement = root.querySelector("#writer-announcement");
  const cancel = root.querySelector("#navigation-cancel");
  const submit = root.querySelector("#navigation-save");

  let edit;
  let busy = false;

  function openForm(path, current) {
    if (busy) return;
    const level = levels[path.length];
    const capitalized = level[0].toUpperCase() + level.slice(1);
    edit = { path, id: current?.id, action: current ? "rename" : "add" };
    root.querySelector("#navigation-title").textContent = current ? `Edit ${level}` : `Add ${level}`;
    root.querySelector("#navigation-name-label").textContent = `${capitalized} name`;
    name.value = current?.title ?? "";
    color.value = current?.color || "#805b34";
    useDefault.checked = !current?.color;
    const options = current ? [] : getNavigation(getConfiguration(), path)?.types ?? [];
    type.replaceChildren(...options.map(value => new Option(value[0].toUpperCase() + value.slice(1), value)));
    type.closest("label").hidden = !options.length;
    status.textContent = "";
    dialog.showModal();
    name.focus();
  }

  async function save(change) {
    if (busy) return;
    busy = true;
    submit.disabled = true;
    cancel.disabled = true;
    announcement.textContent = "";
    status.textContent = "";
    const before = change.action === "add"
      ? new Set(getNavigation(getConfiguration(), change.path).items.map(item => item.id)) : null;
    try {
      const data = await changeNavigation(change);
      if (dialog.open) dialog.close();
      const added = before && getNavigation(data, change.path).items.find(item => !before.has(item.id));
      onSaved(data, added && { path: change.path, id: added.id });

      const list = [...root.querySelectorAll("[data-navigation-path]")]
        .find(node => node.dataset.navigationPath === JSON.stringify(change.path));
      const focusId = added?.id ?? (change.action === "remove" ? undefined : change.id);
      const focus = [...(list?.querySelectorAll("[data-navigation-id]") ?? [])]
        .find(node => node.dataset.navigationId === focusId);
      (focus ?? list?.querySelector('[aria-pressed="true"]'))?.focus();
      announcement.textContent = `Navigation saved to ${saveTarget}.`;
    } catch (error) {
      if (dialog.open) status.textContent = error.message;
      else announcement.textContent = error.message;
    } finally {
      busy = false;
      submit.disabled = false;
      cancel.disabled = false;
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    save({ ...edit, title: name.value, color: useDefault.checked ? "" : color.value, type: type.value });
  });
  color.addEventListener("input", () => { useDefault.checked = false; });
  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => {
    if (busy) event.preventDefault();
  });

  return {
    attach(list, path, controls, options, current) {
      const level = levels[path.length];
      list.dataset.navigationPath = JSON.stringify(path);
      let dragging;
      for (const [index, { control, id }] of options.entries()) {
        control.dataset.navigationId = id;
        control.classList.add("draggable-navigation");
        control.draggable = true;
        control.title = "Drag to reorder, or press Alt and an arrow key";
        control.ondragstart = event => {
          dragging = id;
          control.classList.add("is-dragging");
          event.dataTransfer.setData("text/plain", id);
          event.dataTransfer.effectAllowed = "move";
        };
        control.ondragend = () => {
          dragging = undefined;
          control.classList.remove("is-dragging");
          for (const option of options) option.control.classList.remove("navigation-drop-target");
        };
        control.ondragover = event => {
          if (!dragging || dragging === id) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          control.classList.add("navigation-drop-target");
        };
        control.ondragleave = () => control.classList.remove("navigation-drop-target");
        control.ondrop = event => {
          if (!dragging || dragging === id) return;
          event.preventDefault();
          save({ action: "move", path, id: dragging, targetId: id });
        };
        control.onkeydown = event => {
          if (!event.altKey) return;
          const direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1
            : ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : 0;
          if (!direction) return;
          event.preventDefault();
          if (options[index + direction]) save({ action: "move", path, id, direction });
        };
      }
      const add = button("Add", `Add ${level}`, () => openForm(path));
      const editButton = button("Edit", `Edit ${level}`, () => openForm(path, current));
      const remove = button("Remove", `Remove ${level}`, () => {
        if (window.confirm(`Remove "${current.title}" and its contents from ${saveTarget}?`)) {
          save({ action: "remove", path, id: current.id });
        }
      });
      editButton.disabled = !current;
      remove.disabled = !current;
      const row = document.createElement("div");
      row.className = "navigation-actions";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", `${level} writer tools`);
      row.append(add, editButton, remove);
      controls.replaceChildren(row);
    },
  };
}

