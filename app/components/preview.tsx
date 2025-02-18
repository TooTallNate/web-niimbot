import { useEffect, useRef } from 'react';
import type { HTMLAttributes, RefObject } from 'react';

export interface PreviewProps extends HTMLAttributes<HTMLCanvasElement> {
	interval?: number;
	sourceRef: RefObject<HTMLCanvasElement | null>;
	applyDither?: (imageData: ImageData) => void;
}

export function Preview({
	applyDither,
	sourceRef,
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
		}
		render();
		const intervalId = setInterval(render, interval);
		return () => clearInterval(intervalId);
	}, [applyDither, interval, sourceRef.current]);

	return <canvas {...rest} ref={previewRef} />;
}
