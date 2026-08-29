import { CdpClient } from './cdp_client.ts';
import type { CdpTarget } from './cdp_client.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ServiceWorkerEvaluation — evaluates in a worker Chrome may stop at any moment
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Runs an expression inside the extension's background service worker, and keeps running it when
 * Chrome takes the worker away.
 *
 * A Manifest Version 3 service worker is not a process that stays up. Chrome stops it when it looks
 * idle and starts it again when something needs it, and neither event is announced to a Chrome
 * DevTools Protocol client holding a connection to it. So an evaluation can be sent to a worker that
 * is already gone, and the reply never comes.
 *
 * On a fast machine the gap between finding the worker and evaluating in it is a few milliseconds
 * and this never happens. On a shared continuous integration runner it is long enough that it does:
 * `Runtime.evaluate got no reply within 30000ms` was a live check failing in its `before` hook, with
 * every check after it cancelled and nothing anywhere naming the browser as the cause.
 *
 * Every expression passed here must be safe to run more than once, because a retry runs it again.
 */
export class ServiceWorkerEvaluation {
	/** The tail of the service worker's address, which is how it is told from every other target. */
	static readonly SERVICE_WORKER_PATH = 'dist/background_service_worker.js';

	/** How many times to look for the service worker before giving up. */
	static readonly TARGET_ATTEMPTS = 40;

	/** How long to wait between two attempts to find the service worker, in milliseconds. */
	static readonly TARGET_POLL_DELAY = 250;

	/** How many times to send one expression before giving up on it. */
	static readonly EVALUATION_ATTEMPTS = 4;

	/**
	 * Waits for the extension's service worker to start, and returns the target it is running as.
	 *
	 * A Chrome that has only just been launched has not installed the extension yet, so the worker is
	 * absent for the first second or two.
	 *
	 * @param port - The remote debugging port.
	 * @returns The service worker's target.
	 * @throws When the service worker never starts.
	 */
	static async waitForTarget(port: number): Promise<CdpTarget> {
		for (let attempt = 0; attempt < ServiceWorkerEvaluation.TARGET_ATTEMPTS; attempt += 1) {
			const targets = await CdpClient.listTargets(port);
			const worker = targets.find(
				(target) =>
					target.type === 'service_worker' &&
					target.url.includes(ServiceWorkerEvaluation.SERVICE_WORKER_PATH),
			);
			if (worker !== undefined) {
				return worker;
			}
			await ServiceWorkerEvaluation._pause(ServiceWorkerEvaluation.TARGET_POLL_DELAY);
		}
		throw new Error('the WebMCP Everywhere service worker never started');
	}

	/**
	 * Evaluates one expression in the service worker, finding it again if it was stopped.
	 *
	 * @param port - The remote debugging port.
	 * @param expression - The expression to evaluate. It runs again on a retry, so it must be safe to
	 *                     run more than once.
	 * @returns Whatever the expression produced.
	 * @throws When every attempt failed, carrying the last failure's message.
	 */
	static async evaluate<ValueType = unknown>(port: number, expression: string): Promise<ValueType> {
		let lastProblem = 'the service worker was never reached';
		for (let attempt = 0; attempt < ServiceWorkerEvaluation.EVALUATION_ATTEMPTS; attempt += 1) {
			const worker = await ServiceWorkerEvaluation.waitForTarget(port);
			const client = new CdpClient(port);
			try {
				await client.connect(worker.webSocketDebuggerUrl);
				return await client.evaluate<ValueType>(expression);
			} catch (error) {
				lastProblem = error instanceof Error ? error.message : String(error);
			} finally {
				client.close();
			}
			await ServiceWorkerEvaluation._pause(ServiceWorkerEvaluation.TARGET_POLL_DELAY);
		}
		throw new Error(
			`the service worker did not answer after ${ServiceWorkerEvaluation.EVALUATION_ATTEMPTS} attempts: ${lastProblem}`,
		);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Waits.
	 *
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async _pause(milliseconds: number): Promise<void> {
		await new Promise((resolve) => {
			setTimeout(resolve, milliseconds);
		});
	}
}
