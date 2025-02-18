// Adapted from: https://github.com/NielsLeenheer/CanvasDither/blob/master/src/canvas-dither.js

/**
 * Change the image to grayscale
 *
 * @param  {object}   image         The imageData of a Canvas 2d context
 *
 */
export function grayscale(image: ImageData) {
	for (let i = 0; i < image.data.length; i += 4) {
		const luminance =
			image.data[i] * 0.299 +
			image.data[i + 1] * 0.587 +
			image.data[i + 2] * 0.114;
		image.data.fill(luminance, i, i + 3);
	}
}

/**
 * Change the image to blank and white using a simple threshold
 *
 * @param  {object}   image         The imageData of a Canvas 2d context
 * @param  {number}   threshold     Threshold value (0-255)
 */
export function threshold(image: ImageData, threshold = 128) {
	for (let i = 0; i < image.data.length; i += 4) {
		const luminance =
			image.data[i] * 0.299 +
			image.data[i + 1] * 0.587 +
			image.data[i + 2] * 0.114;

		const value = luminance < threshold ? 0 : 255;
		image.data.fill(value, i, i + 3);
	}
}

/**
 * Change the image to blank and white using the Bayer algorithm
 *
 * @param  {object}   image         The imageData of a Canvas 2d context
 * @param  {number}   threshold     Threshold value (0-255)
 */
export function bayer(image: ImageData, threshold = 128) {
	const thresholdMap = [
		[15, 135, 45, 165],
		[195, 75, 225, 105],
		[60, 180, 30, 150],
		[240, 120, 210, 90],
	];

	for (let i = 0; i < image.data.length; i += 4) {
		const luminance =
			image.data[i] * 0.299 +
			image.data[i + 1] * 0.587 +
			image.data[i + 2] * 0.114;

		const x = (i / 4) % image.width;
		const y = Math.floor(i / 4 / image.width);
		const map = Math.floor((luminance + thresholdMap[x % 4][y % 4]) / 2);
		const value = map < threshold ? 0 : 255;
		image.data.fill(value, i, i + 3);
	}
}

/**
 * Change the image to blank and white using the Floyd-Steinberg algorithm
 *
 * @param  {object}   image         The imageData of a Canvas 2d context
 */
export function floydsteinberg(image: ImageData) {
	const width = image.width;
	const luminance = new Uint8ClampedArray(image.width * image.height);

	for (let l = 0, i = 0; i < image.data.length; l++, i += 4) {
		luminance[l] =
			image.data[i] * 0.299 +
			image.data[i + 1] * 0.587 +
			image.data[i + 2] * 0.114;
	}

	for (let l = 0, i = 0; i < image.data.length; l++, i += 4) {
		const value = luminance[l] < 129 ? 0 : 255;
		const error = Math.floor((luminance[l] - value) / 16);
		image.data.fill(value, i, i + 3);

		luminance[l + 1] += error * 7;
		luminance[l + width - 1] += error * 3;
		luminance[l + width] += error * 5;
		luminance[l + width + 1] += error * 1;
	}
}

/**
 * Change the image to blank and white using the Atkinson algorithm
 *
 * @param  {object}   image         The imageData of a Canvas 2d context
 */
export function atkinson(image: ImageData) {
	const width = image.width;
	const luminance = new Uint8ClampedArray(image.width * image.height);

	for (let l = 0, i = 0; i < image.data.length; l++, i += 4) {
		luminance[l] =
			image.data[i] * 0.299 +
			image.data[i + 1] * 0.587 +
			image.data[i + 2] * 0.114;
	}

	for (let l = 0, i = 0; i < image.data.length; l++, i += 4) {
		const value = luminance[l] < 129 ? 0 : 255;
		const error = Math.floor((luminance[l] - value) / 8);
		image.data.fill(value, i, i + 3);

		luminance[l + 1] += error;
		luminance[l + 2] += error;
		luminance[l + width - 1] += error;
		luminance[l + width] += error;
		luminance[l + width + 1] += error;
		luminance[l + 2 * width] += error;
	}
}
