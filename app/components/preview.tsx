import { useEffect, useRef } from 'react';
import type { HTMLAttributes, RefObject } from 'react';

export interface PreviewProps extends HTMLAttributes<HTMLCanvasElement> {
	interval?: number;
	highlightColumn?: number;
	sourceRef: RefObject<HTMLCanvasElement | null>;
	applyDither?: (imageData: ImageData) => void;
}

export function Preview({
	applyDither,
	sourceRef,
	highlightColumn,
	interval = 100,
	...rest
}: PreviewProps) {
	const previewRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		function render() {
			const sourceCanvas = sourceRef.current;
			if (!sourceCanvas) return;
			const previewCtx = previewRef.current?.getContext('2d');
			if (!previewCtx) return;
			const imageData = sourceCanvas
				.getContext('2d')
				?.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
			if (!imageData) return;
			applyDither?.(imageData);
			previewCtx.putImageData(imageData, 0, 0);

			if (typeof highlightColumn === 'number') {
				previewCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
				previewCtx.fillRect(highlightColumn, 0, 1, imageData.height);
				previewCtx.fillStyle = 'rgba(255, 0, 0, 0.2)';
				previewCtx.fillRect(
					highlightColumn - 1,
					0,
					3,
					imageData.height
				);
			}
		}
		render();
		const intervalId = setInterval(render, interval);
		return () => clearInterval(intervalId);
	}, [applyDither, interval, sourceRef.current, highlightColumn]);

	return <canvas {...rest} ref={previewRef} />;
}
