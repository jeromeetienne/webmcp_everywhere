///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Popup — shows what is registered here and lets the user withdraw it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { ExtensionStorage } from './extension_storage.js';

/** The shape the runtime publishes and the service worker holds on to. */
type RuntimeReportShape = {
	/** The origin the runtime ran on. */
	origin: string;
	/** The adapter that matched, or `null`. */
	siteSlug: string | null;
	/** Whether the adapter stood down for a first-party tool surface. */
	yielded: boolean;
	/** The qualified names registered. */
	registered: string[];
	/** What was withheld, and why. */
	withheld: Array<{ name: string; reason: string }>;
	/** Anything that went wrong. */
	errors: string[];
};

/**
 * The extension's user interface.
 *
 * It answers the two questions issue #1 says a user must be able to answer at a glance: what can an
 * agent do on this page right now, and how do I stop it.
 */
class Popup {
	/**
	 * Renders the popup for whichever tab is in front.
	 *
	 * @returns Nothing.
	 */
	static async start(): Promise<void> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		const body = document.getElementById('body');
		if (body === null) {
			return;
		}
		if (tab?.id === undefined || tab.url === undefined) {
			body.textContent = 'No page here.';
			return;
		}

		const report = (await chrome.runtime.sendMessage({
			kind: 'getReportForTab',
			tabId: tab.id,
		})) as RuntimeReportShape | null;

		const origin = new URL(tab.url).origin;
		const settings = await ExtensionStorage.read();
		Popup._render(body, report, origin, settings.globallyEnabled);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Draws the whole popup.
	 *
	 * @param body - The element to draw into.
	 * @param report - The runtime's report for this tab, or `null` when no adapter ran.
	 * @param origin - The current page's origin.
	 * @param globallyEnabled - Whether the kill switch is off.
	 * @returns Nothing.
	 */
	static _render(
		body: HTMLElement,
		report: RuntimeReportShape | null,
		origin: string,
		globallyEnabled: boolean,
	): void {
		body.textContent = '';

		if (report === null || report.siteSlug === null) {
			body.append(Popup._paragraph('No adapter covers this page.', 'none'));
			body.append(Popup._killSwitchRow(globallyEnabled));
			return;
		}

		if (report.yielded === true) {
			body.append(
				Popup._paragraph(
					'This site ships its own WebMCP tools, so the adapter stood down.',
					'warn',
				),
			);
		}

		const site = document.createElement('div');
		site.className = 'site';
		site.textContent = origin;
		body.append(site);

		const slug = document.createElement('div');
		slug.className = 'slug';
		slug.textContent = `adapter: ${report.siteSlug}`;
		body.append(slug);

		body.append(Popup._toolList('Registered', report.registered, 'ok'));
		body.append(
			Popup._toolList(
				'Withheld',
				report.withheld.map((entry) => entry.name),
				'held',
			),
		);

		if (report.errors.length > 0) {
			body.append(Popup._paragraph(report.errors.join('; '), 'warn'));
		}

		body.append(Popup._actingRow(origin));
		body.append(Popup._killSwitchRow(globallyEnabled));
	}

	/**
	 * Builds a labelled list of tool names.
	 *
	 * @param heading - The list's heading.
	 * @param names - The tool names.
	 * @param markClass - The style for the small marker beside each name.
	 * @returns The list element.
	 */
	static _toolList(heading: string, names: string[], markClass: string): HTMLElement {
		const wrapper = document.createElement('div');
		const title = document.createElement('h1');
		title.textContent = `${heading} (${names.length})`;
		wrapper.append(title);

		if (names.length === 0) {
			wrapper.append(Popup._paragraph('none', 'none'));
			return wrapper;
		}

		const list = document.createElement('ul');
		for (const name of names) {
			const item = document.createElement('li');
			const mark = document.createElement('span');
			mark.className = `mark ${markClass}`;
			mark.textContent = markClass === 'ok' ? 'live' : 'held';
			const code = document.createElement('code');
			code.textContent = name;
			item.append(mark, code);
			list.append(item);
		}
		wrapper.append(list);
		return wrapper;
	}

	/**
	 * Builds the per-origin opt-in for acting tools.
	 *
	 * @param origin - The origin the switch applies to.
	 * @returns The row element.
	 */
	static _actingRow(origin: string): HTMLElement {
		const row = document.createElement('div');
		row.className = 'row';
		const label = document.createElement('label');
		label.textContent = 'Let agents act on this site';
		const toggle = document.createElement('input');
		toggle.type = 'checkbox';
		void ExtensionStorage.read().then((settings) => {
			toggle.checked = settings.actingAllowedByOrigin[origin] === true;
		});
		toggle.addEventListener('change', () => {
			void ExtensionStorage.setActingAllowed(origin, toggle.checked).then(() => {
				window.close();
			});
		});
		row.append(label, toggle);
		return row;
	}

	/**
	 * Builds the global kill switch.
	 *
	 * @param globallyEnabled - Whether the extension is currently on.
	 * @returns The row element.
	 */
	static _killSwitchRow(globallyEnabled: boolean): HTMLElement {
		const row = document.createElement('div');
		row.className = 'row';
		const label = document.createElement('label');
		label.textContent = 'WebMCP Everywhere is on';
		const toggle = document.createElement('input');
		toggle.type = 'checkbox';
		toggle.checked = globallyEnabled;
		toggle.addEventListener('change', () => {
			void ExtensionStorage.setGloballyEnabled(toggle.checked).then(() => {
				window.close();
			});
		});
		row.append(label, toggle);
		return row;
	}

	/**
	 * Builds a short paragraph.
	 *
	 * @param text - The text to show.
	 * @param className - The style to apply.
	 * @returns The paragraph element.
	 */
	static _paragraph(text: string, className: string): HTMLElement {
		const paragraph = document.createElement('div');
		paragraph.className = className;
		paragraph.textContent = text;
		return paragraph;
	}
}

void Popup.start();
