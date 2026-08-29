///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PageWaiting — waits for a page to catch up, without changing anything on it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The waiting every adapter needs, in one place.
 *
 * A tool that reads the page straight after asking it to change reads the state from before the
 * change, and reports it as the result of its own interaction. Every adapter written so far grew its
 * own copy of the same two helpers to avoid that, differing only in the poll interval.
 *
 * Nothing here changes the page. Anything that does belongs in `page_driving.ts`, which the permission
 * audit reads as acting.
 */
export class PageWaiting {
	/** How long to wait between two tries when the caller names no other figure, in milliseconds. */
	static readonly DEFAULT_POLL_INTERVAL = 50;

	/**
	 * Waits for a moment.
	 *
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async pause(milliseconds: number): Promise<void> {
		await new Promise((resolve) => {
			setTimeout(resolve, milliseconds);
		});
	}

	/**
	 * Waits until a test passes, or until the time runs out.
	 *
	 * The timeout is reported rather than thrown, because an interaction that changed nothing is a
	 * normal outcome a tool has to describe, not a fault. A caller that needs the difference tests the
	 * returned value.
	 *
	 * @param test - The condition to wait for, run repeatedly until it passes.
	 * @param timeoutMs - How long to keep trying, in milliseconds.
	 * @param pollIntervalMs - How long to wait between two tries, in milliseconds.
	 * @returns `true` when the test passed, `false` when the time ran out first.
	 */
	static async waitUntil(
		test: () => boolean,
		timeoutMs: number,
		pollIntervalMs: number = PageWaiting.DEFAULT_POLL_INTERVAL,
	): Promise<boolean> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (test() === true) {
				return true;
			}
			await PageWaiting.pause(pollIntervalMs);
		}
		return test();
	}

	/**
	 * Waits until something the page holds stops being what it was.
	 *
	 * This is `waitUntil` with the test every adapter writes for it: read a signature of the page's own
	 * state before the interaction, then wait for that signature to differ.
	 *
	 * @param readSignature - Reads whatever stands for the page's state, usually stored text.
	 * @param before - What `readSignature` returned before the interaction.
	 * @param timeoutMs - How long to keep trying, in milliseconds.
	 * @param pollIntervalMs - How long to wait between two tries, in milliseconds.
	 * @returns `true` when the signature changed, `false` when the time ran out first.
	 */
	static async waitUntilChanged(
		readSignature: () => string | null,
		before: string | null,
		timeoutMs: number,
		pollIntervalMs: number = PageWaiting.DEFAULT_POLL_INTERVAL,
	): Promise<boolean> {
		return await PageWaiting.waitUntil(
			() => readSignature() !== before,
			timeoutMs,
			pollIntervalMs,
		);
	}
}
