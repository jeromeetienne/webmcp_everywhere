///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ReportBrowserEnvironment — says whether this machine can run the live checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { CdpClient } from '../chrome_devtools_protocol/cdp_client.ts';
import { LaunchChrome } from '../../contribs/chrome_extension/tools/launch_chrome.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** What this machine can and cannot do, one field per thing a live check needs. */
export type BrowserEnvironmentReport = {
	/** The platform Node.js reports. */
	platform: string;
	/** The Chrome that would be launched, or the reason none was found. */
	chromePath: string;
	/** What that Chrome prints for `--version`, empty when it could not be run. */
	chromeVersion: string;
	/** Whether the extension installed over the Chrome DevTools Protocol. */
	isExtensionInstalled: boolean;
	/** Whether `document.modelContext` exists on a loaded page. */
	isWebMcpPresent: boolean;
	/** The tool names the adapter registered on the page, empty when none did. */
	registeredTools: string[];
	/** Everything that went wrong, in the order it went wrong. */
	problems: string[];
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ReportBrowserEnvironment
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Answers the one question that decides whether a machine can run the live checks at all.
 *
 * The live checks need four things, and each of them fails silently on its own: a Chrome that
 * exists, a Chrome new enough for the WebMCP origin trial, an extension that installs over the
 * Chrome DevTools Protocol, and `document.modelContext` on a real page. A runner missing any one of
 * them reports a broken adapter, which is the wrong answer to a working adapter and an unusable
 * machine.
 *
 * So this reports the four facts separately rather than passing or failing as a whole. A nightly
 * job runs it first, and says "this machine cannot run the checks" instead of "the adapter broke".
 */
export class ReportBrowserEnvironment {
	/** The page to load, which is the smallest adapted site. */
	static readonly TARGET_URL = 'https://demo.playwright.dev/todomvc/';

	/** How long to wait for the page to settle before reading it, in milliseconds. */
	static readonly SETTLE = 6000;

	/**
	 * Launches a Chrome and reports what it found.
	 *
	 * @returns One field per thing a live check needs.
	 */
	static async run(): Promise<BrowserEnvironmentReport> {
		const report: BrowserEnvironmentReport = {
			platform: process.platform,
			chromePath: '',
			chromeVersion: '',
			isExtensionInstalled: false,
			isWebMcpPresent: false,
			registeredTools: [],
			problems: [],
		};

		try {
			report.chromePath = LaunchChrome.chromePath();
			report.chromeVersion = LaunchChrome.chromeVersion();
		} catch (error) {
			report.problems.push(ReportBrowserEnvironment._messageOf(error));
			return report;
		}

		let page: CdpClient | null = null;
		try {
			const launched = await LaunchChrome.run({
				url: ReportBrowserEnvironment.TARGET_URL,
			});
			report.isExtensionInstalled = launched.extensionId !== '';
			page = await CdpClient.connectToPage(launched.port, 'todomvc');
			await page.navigate(ReportBrowserEnvironment.TARGET_URL, ReportBrowserEnvironment.SETTLE);
			const presence = await page.evaluate<string>(
				'String(typeof document.modelContext !== "undefined")',
			);
			report.isWebMcpPresent = presence === 'true';
			if (report.isWebMcpPresent === true) {
				const names = await page.evaluate<string>(
					'document.modelContext.getTools().then((tools) => JSON.stringify(tools.map((tool) => tool.name)))',
				);
				report.registeredTools = JSON.parse(names) as string[];
			}
		} catch (error) {
			report.problems.push(ReportBrowserEnvironment._messageOf(error));
		} finally {
			page?.close();
		}

		return report;
	}

	/**
	 * Prints a report as lines a person reads in a job log.
	 *
	 * @param report - The report to print.
	 * @returns Nothing.
	 */
	static print(report: BrowserEnvironmentReport): void {
		console.log(`platform            ${report.platform}`);
		console.log(`chrome path         ${report.chromePath === '' ? 'NOT FOUND' : report.chromePath}`);
		console.log(`chrome version      ${report.chromeVersion === '' ? 'UNKNOWN' : report.chromeVersion}`);
		console.log(`extension installed ${report.isExtensionInstalled}`);
		console.log(`document.modelContext present ${report.isWebMcpPresent}`);
		console.log(`registered tools    ${report.registeredTools.length}`);
		for (const name of report.registeredTools) {
			console.log(`                    ${name}`);
		}
		for (const problem of report.problems) {
			console.log(`problem             ${problem}`);
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Turns anything thrown into a readable string.
	 *
	 * @param error - The thrown value.
	 * @returns A message.
	 */
	static _messageOf(error: unknown): string {
		if (error instanceof Error) {
			return `${error.name}: ${error.message}`;
		}
		return String(error);
	}
}

if (import.meta.filename === process.argv[1]) {
	const report = await ReportBrowserEnvironment.run();
	ReportBrowserEnvironment.print(report);
	process.exit(report.registeredTools.length > 0 ? 0 : 1);
}
