///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PageDriving — the interactions that change a page, and are meant to
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The page interactions every adapter has had to work out for itself.
 *
 * **Every helper in this file changes the page.** That is the whole boundary between this file and
 * `page_waiting.ts`, and `tools/site_adapter/permission_audit.ts` depends on it: a handler that
 * names `PageDriving` at all is read as acting, whatever its `permissionClass` field says. A helper
 * that changes nothing belongs in `page_waiting.ts`, or the audit starts refusing honest read-only
 * tools.
 */
export class PageDriving {
	/**
	 * Writes text into an input field the only way a framework notices.
	 *
	 * Assigning to `element.value` does nothing on a React page: React holds its own copy of the value
	 * and overwrites the assignment on the next render, so the field looks written and the page never
	 * hears about it. The native setter on the prototype is the one React's own listener is watching,
	 * and the `input` event afterwards is what tells the page to read it. This was found on TodoMVC and
	 * then needed again on Can I use..., which is not React.
	 *
	 * @param element - The input field to write into.
	 * @param text - The text to write.
	 * @returns Nothing.
	 * @throws When this browser does not expose the native value setter.
	 */
	static writeIntoInputField(element: HTMLInputElement, text: string): void {
		const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
		if (descriptor === undefined || descriptor.set === undefined) {
			throw new Error('this browser does not let an input field be written to');
		}
		descriptor.set.call(element, text);
		element.dispatchEvent(
			new Event('input', {
				bubbles: true,
			}),
		);
	}

	/**
	 * Presses Enter on an element, the way a page's own key handlers expect it.
	 *
	 * `keyCode` and `which` are deprecated and are set anyway, because a page written against them
	 * ignores a `KeyboardEvent` that carries only `key`.
	 *
	 * @param element - The element to press Enter on.
	 * @returns Nothing.
	 */
	static pressEnter(element: HTMLElement): void {
		element.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				keyCode: 13,
				which: 13,
				bubbles: true,
			}),
		);
	}
}
