export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

export function binaryStringToBytes(binaryString: string): Uint8Array {
	// Calculate how many bytes we need (rounding up length/8)
	const numBytes = Math.ceil(binaryString.length / 8);
	const result = new Uint8Array(numBytes);

	// Pad the binary string with zeros on the right if needed
	const paddedBinary = binaryString.padEnd(numBytes * 8, '0');

	// Process 8 bits at a time
	for (let i = 0; i < numBytes; i++) {
		const byte = paddedBinary.slice(i * 8, (i + 1) * 8);
		// Convert 8 bits to a number
		result[i] = Number.parseInt(byte, 2);
	}

	return result;
}

export function blobToDataURL(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			resolve(reader.result as string);
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

export function blobToImageDimensions(blob: Blob): Promise<{
	width: number;
	height: number;
}> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			const { width, height } = img;
			URL.revokeObjectURL(url);
			resolve({ width, height });
		};
		img.onerror = (err) => {
			URL.revokeObjectURL(url);
			reject(err);
		};
		img.src = url;
	});
}

export function pasteSvgAsBlob(event: ClipboardEvent): Blob | null {
	const text = event.clipboardData?.getData('text/plain');
	if (!text || !text.includes('<svg')) return null;

	const parse = new DOMParser();
	const doc = parse.parseFromString(text, 'text/html');
	const svg = doc.querySelector('svg');
	if (!svg) return null;

	// As a small optimization, if the SVG only has one path which is filled
	// white, then replace it with black so that it is visible on the canvas
	const pathNodes = svg.querySelectorAll('path');
	if (pathNodes.length === 1) {
		const path = pathNodes[0];
		const fill = normalizeColor(path.getAttribute('fill'));
		if (fill === 'rgb(255, 255, 255)') {
			pathNodes[0].setAttribute('fill', 'black');
		}
	}

	return new Blob([svg.outerHTML], { type: 'image/svg+xml' });
}

export function normalizeColor(color: string | null): string {
	if (!color) return '';

	const tempElement = document.createElement('div');
	tempElement.style.color = color;
	tempElement.style.display = 'none';
	document.body.appendChild(tempElement);

	// The computed color will be returned in rgb(a) format
	const normalizedColor = getComputedStyle(tempElement).color;

	// Clean up the temporary element
	document.body.removeChild(tempElement);

	return normalizedColor;
}
