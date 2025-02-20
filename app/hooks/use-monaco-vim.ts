import { useEffect, useState } from 'react';
import type * as Monaco from 'monaco-editor';
import { sleep } from '~/lib/util';

const LOCAL_STORAGE_KEY = 'monaco-vim.enabled';

export function useMonacoVim(
	editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>,
	statusBarRef: React.RefObject<HTMLDivElement | null>
) {
	const [enabled, setEnabled] = useState(() => {
		try {
			return localStorage[LOCAL_STORAGE_KEY] === '1';
		} catch (err) {
			console.error(
				`Failed to read localStorage["${LOCAL_STORAGE_KEY}"]: ${err}`
			);
		}
		return false;
	});

	useEffect(() => {
		try {
			if (enabled) {
				localStorage[LOCAL_STORAGE_KEY] = '1';
			} else {
				localStorage.removeItem(LOCAL_STORAGE_KEY);
			}
		} catch (err) {
			console.error(
				`Failed to write localStorage["${LOCAL_STORAGE_KEY}"]: ${err}`
			);
		}

		if (!enabled) return;

		const abortController = new AbortController();
		let vimMode:
			| {
					dispose: () => void;
			  }
			| undefined;
		(async () => {
			if (abortController.signal.aborted) {
				return;
			}

			// @ts-expect-error - "monaco-vim" doesn't have types
			const { initVimMode } = await import('monaco-vim');
			let editor = editorRef.current;
			let statusBar = statusBarRef.current;

			while (!editor || !statusBar) {
				if (abortController.signal.aborted) {
					return;
				}
				// sleep and retry if the editor is still loading
				await sleep(100);
				editor = editorRef.current;
				statusBar = statusBarRef.current;
			}

			if (abortController.signal.aborted) {
				return;
			}

			vimMode = initVimMode(editor, statusBar);
		})();
		return () => {
			if (vimMode) {
				vimMode.dispose();
			}
			abortController.abort();
		};
	}, [enabled, editorRef.current, statusBarRef.current]);

	return { enabled, setEnabled };
}
