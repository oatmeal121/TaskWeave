/** Insert a literal tab while retaining native undo; Shift+Tab still moves focus. */
export function insertDescriptionTab(event: KeyboardEvent) {
  if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  const textarea = event.currentTarget;
  if (!(textarea instanceof HTMLTextAreaElement) || textarea.readOnly || textarea.disabled) return;
  event.preventDefault();
  if (!document.execCommand("insertText", false, "\t")) {
    textarea.setRangeText("\t", textarea.selectionStart, textarea.selectionEnd, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
