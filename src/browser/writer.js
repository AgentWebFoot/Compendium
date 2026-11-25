import { imageFormats, isImageName } from "../images.js";
import { createSpellcheckField } from "./writer-spellcheck.js";
import { createFormattingControls } from "./inline-format.js";

export function createEntryEditor(root, writer, saveTarget) {
  const form = root.querySelector("#writer-form");
  const dialog = root.querySelector("#writer-dialog");
  const fields = root.querySelector("#writer-fields");
  const status = root.querySelector("#writer-status");
  const saveButton = form.querySelector('button[type="submit"]');

  const deleteButton = root.querySelector("#writer-delete");

  let currentEdit;

  function imageUpload(textarea, reference, field) {
    const controls = document.createElement("div");
    controls.className = "image-upload";
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = Object.keys(imageFormats).join(",");
    picker.hidden = true;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Upload image";
    button.setAttribute("aria-label", `Upload image to ${field}`);
    button.addEventListener("click", () => {
      if (!saveButton.disabled) picker.click();
    });
    picker.addEventListener("change", async () => {
      const file = picker.files[0];
      picker.value = "";
      if (!file || saveButton.disabled) return;
      const original = textarea.value;
      const position = [textarea.selectionStart, textarea.selectionEnd];
      status.textContent = "Uploading image…";
      saveButton.disabled = true;
      deleteButton.disabled = true;
      button.disabled = true;
      try {
        const { name } = await writer.uploadImage(file, { reference });
        if (!isImageName(name)) throw new Error("The upload did not return a valid image filename.");
        const current = textarea.value;
        const [start, end] = current === original ? position : [textarea.selectionStart, textarea.selectionEnd];
        const caption = file.name.replace(/\.[^.]+$/, "").replace(/[\[\]\r\n]/g, " ").trim();
        const before = start && current[start - 1] !== "\n" ? "\n" : "";
        const after = end < current.length && current[end] !== "\n" ? "\n" : "";
        textarea.setRangeText(`${before}![${caption}](${name})${after}`, start, end, "end");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.focus();
        status.textContent = "";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        saveButton.disabled = false;
        deleteButton.disabled = false;
        button.disabled = false;
      }
    });
    controls.append(button, picker);
    return controls;
  }


  function editEntry(reference, title, entry, { afterSave, afterDelete, paragraphFields = [], hideNavigationColor = false }) {
    fields.replaceChildren();
    status.textContent = "";
    root.querySelector("#writer-title").textContent = `Edit ${title}`;
    const controls = [];
    const spellchecks = [];
    for (const [key, value] of Object.entries(entry)) {
      if (key === "id" || value === null || (hideNavigationColor && key === "color")) continue;
      const label = document.createElement("label");
      label.textContent = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
      const prose = key === "content" || key === "description" || paragraphFields.includes(key);
      const structured = typeof value === "object";
      const input = document.createElement(prose || structured ? "textarea" : "input");
      if (input.tagName === "TEXTAREA") input.rows = prose ? 7 : 3;
      if (typeof value === "boolean") {
        input.type = "checkbox";
        input.checked = value;
      } else {
        input.value = structured ? JSON.stringify(value, null, 2) : String(value);
      }
      if (prose && typeof value === "string") {
        input.id = `writer-field-${controls.length}`;
        label.htmlFor = input.id;
        const formatting = createFormattingControls(input, label.textContent);
        fields.append(label, formatting);
        if (writer.checkSpelling) {
          const spellcheck = createSpellcheckField(input, writer.checkSpelling);
          spellchecks.push(spellcheck);
          fields.append(spellcheck.shell);
        } else {
          fields.append(input);
        }
        if (writer.uploadImage) fields.append(imageUpload(input, reference, label.textContent));
      } else {
        if (structured) input.spellcheck = false;
        label.append(input);
        fields.append(label);
      }
      controls.push({ key, original: input.type === "checkbox" ? input.checked : input.value, value, input });
    }
    currentEdit = { reference, title, controls, spellchecks, afterSave, afterDelete };
    deleteButton.hidden = !afterDelete;
    dialog.showModal();
  }

  form.querySelector('button[type="button"]').addEventListener("click", () => { if (!saveButton.disabled) dialog.close(); });
  dialog.addEventListener("cancel", event => {
    if (saveButton.disabled) event.preventDefault();
  });

  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    for (const spellcheck of currentEdit?.spellchecks ?? []) spellcheck.dispose();
  });

  async function submitChange(operation, body, onSuccess) {
    saveButton.disabled = true;
    deleteButton.disabled = true;
    try {
      const data = await operation(body);
      dialog.close();
      onSuccess(data);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      saveButton.disabled = false;
      deleteButton.disabled = false;
    }
  }

  deleteButton.addEventListener("click", () => {
    if (!currentEdit?.afterDelete || saveButton.disabled) return;
    const { title, reference, afterDelete } = currentEdit;
    if (!window.confirm(`Delete "${title}" from ${saveTarget}?`)) return;
    status.textContent = "";
    submitChange(writer.deleteAbility, reference, afterDelete);
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!currentEdit || saveButton.disabled) return;
    status.textContent = "";
    const values = Object.create(null);
    try {
      for (const { key, original, value, input } of currentEdit.controls) {
        const edited = input.type === "checkbox" ? input.checked : input.value;
        if (edited === original) continue;
        if (typeof value === "number" && (!edited.trim() || !Number.isFinite(Number(edited)))) {
          throw new Error(`Enter a number for "${key}".`);
        }
        if (typeof value === "object") {
          try {
            values[key] = JSON.parse(edited);
          } catch {
            throw new Error(`Enter valid JSON for "${key}".`);
          }
        } else {
          values[key] = typeof value === "number" ? Number(edited) : edited;
        }
      }
      if (Object.keys(values).length) {
        submitChange(writer.saveEntry, { reference: currentEdit.reference, values }, currentEdit.afterSave);
      } else {
        dialog.close();
      }
    } catch (error) {
      status.textContent = error.message;
    }
  });

  return { editEntry, dispose() {
    for (const spellcheck of currentEdit?.spellchecks ?? []) spellcheck.dispose();
  } };
}
